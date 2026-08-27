import { Router, type NextFunction, type Request, type Response } from 'express'
import { SorobanAdapter } from '../soroban/adapter.js'
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js'

export function createBalanceRouter(adapter: SorobanAdapter) {
  const router = Router()

  router.get('/balance/:account', authenticateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { account } = req.params

      if (!account || account.trim() === '') {
        return res.status(400).json({
          error: 'Account parameter is required',
        })
      }

      const userId = req.user?.id

      // Enforce ownership: users can only access their own balance
      if (userId && account !== userId) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
      }

      const balance = await adapter.getBalance(account)
      const config = typeof adapter.getConfig === 'function' ? adapter.getConfig() : { contractId: null, networkPassphrase: null }

      res.json({
        account,
        balance: balance.toString(),
        contractId: (config as any).contractId,
        // Include stub indicator in response for clarity
        adapter: 'stub',
        network: (config as any).networkPassphrase,
      })
    } catch (error) {
      next(error)
    }
  })

  // Add endpoints for credit/debit operations
  router.post('/balance/:account/credit', authenticateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { account } = req.params

      if (!account || account.trim() === '') {
        return res.status(400).json({
          error: 'Account parameter is required',
        })
      }

      const userId = req.user?.id

      // Enforce ownership: users can only credit their own account
      if (userId && account !== userId) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
      }

      const { amount } = req.body

      if (!amount || typeof amount !== 'string') {
        return res.status(400).json({
          error: 'Amount string is required in request body',
        })
      }

      const amountBigInt = BigInt(amount)
      await adapter.credit(account, amountBigInt)

      const newBalance = await adapter.getBalance(account)
      const config = typeof adapter.getConfig === 'function' ? adapter.getConfig() : { contractId: null }

      res.json({
        account,
        credited: amount,
        newBalance: newBalance.toString(),
        contractId: (config as any).contractId,
        adapter: 'stub',
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/balance/:account/debit', authenticateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { account } = req.params

      if (!account || account.trim() === '') {
        return res.status(400).json({
          error: 'Account parameter is required',
        })
      }

      const userId = req.user?.id

      // Enforce ownership: users can only debit their own account
      if (userId && account !== userId) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
      }

      const { amount } = req.body

      if (!amount || typeof amount !== 'string') {
        return res.status(400).json({
          error: 'Amount string is required in request body',
        })
      }

      const amountBigInt = BigInt(amount)
      await adapter.debit(account, amountBigInt)

      const newBalance = await adapter.getBalance(account)
      const config = typeof adapter.getConfig === 'function' ? adapter.getConfig() : { contractId: null }

      res.json({
        account,
        debited: amount,
        newBalance: newBalance.toString(),
        contractId: (config as any).contractId,
        adapter: 'stub',
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
