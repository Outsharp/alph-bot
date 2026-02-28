import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, http, encodeFunctionData, type Hex } from 'viem'
import { base } from 'viem/chains'
import { Logs, Severity } from '../log.js'
import type { Context } from '../ctx.js'
import { x402Payments } from '../db/schema.js'
import id128 from 'id128'

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// EIP-712 domain for USDC on Base (EIP-3009 TransferWithAuthorization)
const USDC_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 8453,
  verifyingContract: USDC_ADDRESS,
} as const

// EIP-3009 TransferWithAuthorization types
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

// Minimal ERC-20 ABI for balanceOf
const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export interface SessionKey {
  privateKey: Hex
  address: Hex
}

interface X402PaymentRequirement {
  maxAmountRequired?: string
  resource: string
  network: string
  payTo: string
  scheme?: string
  amount?: string
  asset?: string
  maxTimeoutSeconds?: number
  extra?: Record<string, unknown>
  description?: string
  mimeType?: string
}

export class X402Adapter extends Logs {
  constructor(ctx: Context) {
    super(ctx)
  }

  /**
   * Generate a new session EOA key pair.
   */
  generateSessionKey(): SessionKey {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    return { privateKey, address: account.address }
  }

  /**
   * Check USDC balance on Base for a given private key.
   */
  async getBalance(privateKey: Hex): Promise<{ balance: bigint; formatted: string }> {
    const account = privateKeyToAccount(privateKey)
    const client = createPublicClient({
      chain: base,
      transport: http(),
    })

    const balance = await client.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint

    // USDC has 6 decimals
    const formatted = (Number(balance) / 1e6).toFixed(6)

    return { balance, formatted }
  }

  /**
   * Make an x402 payment request.
   *
   * 1. Send initial HTTP request
   * 2. If 402 → parse payment requirements
   * 3. Sign EIP-712 TransferWithAuthorization
   * 4. Base64-encode payment payload into X-PAYMENT header
   * 5. Resend request with payment header
   * 6. Record payment in DB
   */
  async pay(
    sessionKey: Hex,
    url: string,
    method: string,
    body?: string,
  ): Promise<{ status: number; data: unknown }> {
    const account = privateKeyToAccount(sessionKey)

    // 1. Initial request
    const fetchOpts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body && method !== 'GET') {
      fetchOpts.body = body
    }

    this.log(Severity.INF, `x402: ${method} ${url}`)

    const initialResponse = await fetch(url, fetchOpts)

    // If not 402, return directly
    if (initialResponse.status !== 402) {
      const data = await initialResponse.json().catch(() => initialResponse.text())
      return { status: initialResponse.status, data }
    }

    // 2. Parse 402 payment requirements
    this.log(Severity.INF, 'x402: received 402, parsing payment requirements')

    const paymentBody = await initialResponse.json() as {
      accepts: X402PaymentRequirement[]
      error?: string
    }

    const requirement = paymentBody.accepts?.[0]
    if (!requirement) {
      throw new Error('x402: no payment requirements in 402 response')
    }

    const { maxAmountRequired, amount, payTo } = requirement

    const signAmount = maxAmountRequired ?? amount

    if (signAmount == undefined) {
      throw new Error('Payment does not specificy payment amount')
    }

    // 3. Sign EIP-712 TransferWithAuthorization
    const nonce = ('0x' + id128.Ulid.generate().toRaw().toString('hex').padStart(64, '0')) as Hex
    const validAfter = 0n
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600) // 1 hour

    const signature = await account.signTypedData({
      domain: USDC_DOMAIN,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: account.address,
        to: payTo as Hex,
        value: BigInt(signAmount),
        validAfter,
        validBefore,
        nonce,
      },
    })

    // 4. Build X-PAYMENT header (per x402 spec v2)
    const accepted: Record<string, unknown> = {
      scheme: requirement.scheme ?? 'exact',
      network: requirement.network,
      amount: signAmount,
      payTo,
    }
    if (requirement.asset) accepted.asset = requirement.asset
    if (requirement.maxTimeoutSeconds) accepted.maxTimeoutSeconds = requirement.maxTimeoutSeconds
    if (requirement.extra) accepted.extra = requirement.extra

    const paymentPayload = {
      x402Version: 2,
      resource: { url },
      accepted,
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: payTo,
          value: signAmount,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      },
    }

    const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64')

    // 5. Resend with payment header
    this.log(Severity.INF, `x402: sending payment ${signAmount} to ${payTo}`)

    const paidFetchOpts: RequestInit = {
      ...fetchOpts,
      headers: {
        ...fetchOpts.headers as Record<string, string>,
        'PAYMENT-SIGNATURE': xPaymentHeader,
        'X-PAYMENT': xPaymentHeader,
      },
    }

    const paidResponse = await fetch(url, paidFetchOpts)
    const data = await paidResponse.json().catch(() => paidResponse.text())

    // 6. Record payment in DB
    const status = paidResponse.ok ? 'settled' : 'failed'

    this.ctx.db.insert(x402Payments).values({
      url,
      method,
      amount: signAmount,
      payTo,
      fromAddress: account.address,
      nonce,
      signature,
      status,
      httpStatus: paidResponse.status,
      errorMessage: paidResponse.ok ? undefined : JSON.stringify(data),
      settledAt: paidResponse.ok ? Date.now() : undefined,
    }).run()

    this.log(Severity.INF, `x402: payment ${status}, HTTP ${paidResponse.status}`)

    return { status: paidResponse.status, data }
  }
}

export { USDC_ADDRESS, USDC_ABI }
