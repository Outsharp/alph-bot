import { describe, it, expect, beforeEach, vi } from 'vitest'
import { X402Adapter } from '../../src/adapters/x402.js'
import { x402Payments } from '../../src/db/schema.js'
import { createTestContext } from '../helpers/setup-db.js'
import type { Context } from '../../src/ctx.js'
import { X402PayConfig, X402BalanceConfig, X402SetupConfig } from '../../src/config.js'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock viem public client for getBalance
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: vi.fn().mockResolvedValue(5000000n), // 5 USDC
    }),
  }
})

describe('X402Adapter', () => {
  let ctx: Context
  let adapter: X402Adapter

  beforeEach(async () => {
    ctx = await createTestContext()
    adapter = new X402Adapter(ctx)
    mockFetch.mockReset()
  })

  describe('generateSessionKey()', () => {
    it('returns a valid hex private key and address', () => {
      const key = adapter.generateSessionKey()

      expect(key.privateKey).toMatch(/^0x[0-9a-f]{64}$/)
      expect(key.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    it('generates unique keys each time', () => {
      const key1 = adapter.generateSessionKey()
      const key2 = adapter.generateSessionKey()

      expect(key1.privateKey).not.toBe(key2.privateKey)
      expect(key1.address).not.toBe(key2.address)
    })
  })

  describe('getBalance()', () => {
    it('returns formatted USDC balance', async () => {
      const key = adapter.generateSessionKey()
      const result = await adapter.getBalance(key.privateKey)

      expect(result.balance).toBe(5000000n)
      expect(result.formatted).toBe('5.000000')
    })
  })

  describe('pay()', () => {
    it('passes through non-402 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ data: 'success' }),
      })

      const key = adapter.generateSessionKey()
      const result = await adapter.pay(key.privateKey, 'https://example.com/api', 'GET')

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ data: 'success' })
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('handles full 402 → payment → 200 flow', async () => {
      // First call returns 402
      mockFetch.mockResolvedValueOnce({
        status: 402,
        json: async () => ({
          accepts: [{
            maxAmountRequired: '100000', // 0.1 USDC
            resource: 'https://example.com/api',
            network: 'base',
            payTo: '0x1234567890123456789012345678901234567890',
            extra: { quote_id: 'test-quote-123' },
          }],
        }),
      })

      // Second call (with payment) returns 200
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ result: 'paid content' }),
      })

      const key = adapter.generateSessionKey()
      const result = await adapter.pay(key.privateKey, 'https://example.com/api', 'POST', '{"query":"test"}')

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ result: 'paid content' })
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Verify X-PAYMENT header was sent
      const secondCall = mockFetch.mock.calls[1]!
      const headers = secondCall[1]?.headers as Record<string, string>
      expect(headers['X-PAYMENT']).toBeDefined()

      // Verify payment is base64 encoded JSON
      const decoded = JSON.parse(Buffer.from(headers['X-PAYMENT']!, 'base64').toString())
      expect(decoded.x402Version).toBe(2)
      expect(decoded.accepted.payTo).toBe('0x1234567890123456789012345678901234567890')
      expect(decoded.accepted.amount).toBe('100000')
      expect(decoded.accepted.extra).toEqual({ quote_id: 'test-quote-123' })
      expect(decoded.resource.url).toBe('https://example.com/api')
      expect(decoded.payload.authorization.to).toBe('0x1234567890123456789012345678901234567890')
      expect(decoded.payload.signature).toMatch(/^0x/)
    })

    it('records payment in DB on success', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 402,
        json: async () => ({
          accepts: [{
            maxAmountRequired: '50000',
            resource: 'https://example.com/api',
            network: 'base',
            payTo: '0xabcdef1234567890abcdef1234567890abcdef12',
          }],
        }),
      })

      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ ok: true }),
      })

      const key = adapter.generateSessionKey()
      await adapter.pay(key.privateKey, 'https://example.com/api', 'GET')

      // Check DB
      const payments = await ctx.db.select().from(x402Payments).all()
      expect(payments).toHaveLength(1)
      expect(payments[0]!.url).toBe('https://example.com/api')
      expect(payments[0]!.status).toBe('settled')
      expect(payments[0]!.amount).toBe('50000')
      expect(payments[0]!.httpStatus).toBe(200)
    })

    it('records failed payment in DB', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 402,
        json: async () => ({
          accepts: [{
            maxAmountRequired: '50000',
            resource: 'https://example.com/api',
            network: 'base',
            payTo: '0xabcdef1234567890abcdef1234567890abcdef12',
          }],
        }),
      })

      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: async () => ({ error: 'payment rejected' }),
      })

      const key = adapter.generateSessionKey()
      await adapter.pay(key.privateKey, 'https://example.com/api', 'GET')

      const payments = await ctx.db.select().from(x402Payments).all()
      expect(payments).toHaveLength(1)
      expect(payments[0]!.status).toBe('failed')
      expect(payments[0]!.errorMessage).toContain('payment rejected')
    })

    it('throws when 402 has no payment requirements', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 402,
        json: async () => ({ accepts: [] }),
      })

      const key = adapter.generateSessionKey()
      await expect(
        adapter.pay(key.privateKey, 'https://example.com/api', 'GET'),
      ).rejects.toThrow('no payment requirements')
    })
  })
})

describe('x402 config validation', () => {
  it('X402PayConfig rejects missing session key', () => {
    expect(() => X402PayConfig.parse({
      'x402-url': 'https://example.com',
    })).toThrow()
  })

  it('X402PayConfig rejects missing url', () => {
    expect(() => X402PayConfig.parse({
      'x402-session-key': '0xabc',
    })).toThrow()
  })

  it('X402PayConfig accepts valid input', () => {
    const result = X402PayConfig.parse({
      'x402-session-key': '0xabc',
      'x402-url': 'https://example.com/api',
      'x402-method': 'POST',
    })
    expect(result['x402-method']).toBe('POST')
    expect(result['x402-session-key']).toBe('0xabc')
  })

  it('X402BalanceConfig rejects missing session key', () => {
    expect(() => X402BalanceConfig.parse({})).toThrow()
  })

  it('X402SetupConfig defaults funding amount to 5', () => {
    const result = X402SetupConfig.parse({})
    expect(result['x402-funding-amount']).toBe(5)
  })
})
