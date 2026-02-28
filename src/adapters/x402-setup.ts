import { MetaMaskSDK } from '@metamask/sdk'
import { X402Adapter, USDC_ADDRESS, USDC_ABI } from './x402.js'
import { encodeFunctionData, parseUnits } from 'viem'
import { Logs, Severity } from '../log.js'
import type { Context } from '../ctx.js'

/**
 * One-time MetaMask Mobile setup flow:
 * 1. Generate session EOA
 * 2. Connect MetaMask Mobile via QR code
 * 3. Send USDC from MetaMask to session EOA
 * 4. Print private key for user to save in .env
 */
export class X402Setup extends Logs {
  private x402: X402Adapter

  constructor(ctx: Context) {
    super(ctx)
    this.x402 = new X402Adapter(ctx)
  }

  async run(fundingAmount: number): Promise<void> {
    // 1. Generate session key
    this.log(Severity.INF, 'x402-setup: generating session EOA...')
    const session = this.x402.generateSessionKey()
    console.log(`\nSession EOA address: ${session.address}`)

    // 2. Connect MetaMask Mobile
    this.log(Severity.INF, 'x402-setup: connecting MetaMask Mobile...')
    console.log('\nScan the QR code below with MetaMask Mobile to connect:\n')

    const sdk = new MetaMaskSDK({
      dappMetadata: {
        name: 'Alph Bot',
        url: 'https://alph.bot',
      },
    })

    await sdk.init()
    const provider = sdk.getProvider()

    if (provider == undefined || provider == null) {
      throw new Error('Could not setup MetaMask Provider')
    }

    const accounts = await provider.request({
      method: 'eth_requestAccounts',
    }) as string[]

    const metamaskAddress = accounts[0]
    if (!metamaskAddress) {
      throw new Error('x402-setup: no MetaMask account connected')
    }

    console.log(`Connected MetaMask: ${metamaskAddress}`)

    // 3. Switch to Base network (chainId 0x2105 = 8453)
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x2105' }],
      })
    } catch {
      // If Base not added, add it
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x2105',
          chainName: 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: ['https://basescan.org'],
        }],
      })
    }

    // Verify MetaMask actually switched to Base before sending the tx
    for (let i = 0; i < 10; i++) {
      const chainId = await provider.request({ method: 'eth_chainId' }) as string
      if (chainId === '0x2105') break
      if (i === 9) {
        throw new Error(
          `x402-setup: MetaMask is on chain ${chainId}, expected 0x2105 (Base). ` +
          'Please switch to Base in MetaMask and try again.'
        )
      }
      await new Promise(r => setTimeout(r, 1000))
    }

    console.log('Network: Base (8453)')

    // 4. Send USDC transfer from MetaMask to session EOA
    const amountInAtomicUnits = parseUnits(fundingAmount.toString(), 6) // USDC = 6 decimals

    const transferData = encodeFunctionData({
      abi: USDC_ABI,
      functionName: 'transfer',
      args: [session.address, amountInAtomicUnits],
    })

    console.log(`\nSending ${fundingAmount} USDC to session EOA...`)
    console.log('Please approve the transaction in MetaMask Mobile.\n')

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: metamaskAddress,
        to: USDC_ADDRESS,
        data: transferData,
        chainId: '0x2105',
      }],
    }) as string

    this.log(Severity.INF, `x402-setup: tx submitted: ${txHash}`)
    console.log(`Transaction submitted: ${txHash}`)
    console.log('Waiting for confirmation...\n')

    // 5. Wait for confirmation by polling
    let confirmed = false
    for (let i = 0; i < 60; i++) {
      const receipt = await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }) as { status: string } | null

      if (receipt?.status === '0x1') {
        confirmed = true
        break
      } else if (receipt?.status === '0x0') {
        throw new Error('x402-setup: transaction reverted')
      }

      await new Promise(r => setTimeout(r, 2000))
    }

    if (!confirmed) {
      throw new Error('x402-setup: transaction confirmation timed out')
    }

    // 6. Print results
    this.log(Severity.INF, 'x402-setup: funding complete')

    console.log('─'.repeat(60))
    console.log('Session EOA funded successfully!')
    console.log('─'.repeat(60))
    console.log(`\nAddress:     ${session.address}`)
    console.log(`Private Key: ${session.privateKey}`)
    console.log(`\nAdd to your .env file:`)
    console.log(`ALPH_BOT_X402_SESSION_KEY=${session.privateKey}`)
    console.log('─'.repeat(60))

    // Cleanup
    await sdk.terminate()
  }
}
