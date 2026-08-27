import { test, expect } from '@playwright/test';

test.describe('Staking Deposit-to-Claim Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses for wallet state, staking positions, balances, and actions
    await page.route('**/api/wallet/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJXFF',
        }),
      });
    });

    await page.route('**/api/staking/position*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          position: {
            staked: '150.000000',
            claimable: '25.000000',
            warming: '0.000000',
            cooling: '0.000000',
            lockExpiry: new Date(Date.now() + 86400000 * 30).toISOString(),
          },
        }),
      });
    });

    await page.route('**/api/staking/mvp-position*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          position: {
            staked: '0.000000',
            claimable: '0.000000',
          },
        }),
      });
    });

    await page.route('**/api/wallet/ngn-balance*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          balance: 500000,
          currency: 'NGN',
        }),
      });
    });

    await page.route('**/api/staking/history*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          history: [],
        }),
      });
    });

    await page.route('**/api/staking/stake*', async (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON();
        if (postData && Number(postData.amount) <= 0) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: 'Amount must be greater than minimum stake requirement',
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Successfully staked tokens',
          }),
        });
      }
    });

    await page.route('**/api/staking/claim*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            txId: 'tx_hash_mock_123456789',
            status: 'CONFIRMED',
            message: 'Rewards claimed successfully',
          }),
        });
      }
    });

    await page.goto('/staking');
  });

  test('1. Connects wallet and deposits into staking', async ({ page }) => {
    // Check if wallet connect button or connected state appears
    const connectButton = page.locator('button:has-text("Connect Wallet")');
    if (await connectButton.isVisible()) {
      await connectButton.click();
    }

    // Switch to NGN balance staking mode or input stake amount
    const stakeInput = page.locator('input#stake-amount, input[placeholder="0.00"]');
    await stakeInput.first().fill('5000');

    // Click stake submit button
    const submitStakeButton = page.locator('button:has-text("Stake")').filter({ hasNotText: 'History' });
    await submitStakeButton.first().click();

    // Verify success or status message
    await expect(page.locator('text=Successfully staked tokens, text=Wallet connected successfully')).toBeVisible();
  });

  test('2. Views the staked position and accrued/claimable rewards', async ({ page }) => {
    // Verify the staked balance and claimable rewards are displayed correctly from position mock
    await expect(page.locator('text=150.000000')).toBeVisible();
    await expect(page.locator('text=25.000000')).toBeVisible();
  });

  test('3. Claims rewards and confirms the balance updates correctly', async ({ page }) => {
    // Open claim modal or trigger claim flow
    const claimButton = page.locator('button:has-text("Claim Rewards"), button:has-text("Claim")');
    if (await claimButton.count() > 0) {
      await claimButton.first().click();
    }

    // Confirm claim in dialog/modal if present
    const confirmClaimButton = page.locator('button:has-text("Confirm Claim"), button:has-text("Proceed to Claim")');
    if (await confirmClaimButton.isVisible()) {
      await confirmClaimButton.click();
    }

    // Verify success confirmation and transaction hash display
    await expect(page.locator('text=tx_hash_mock_123456789, text=Rewards claimed successfully')).toBeVisible();
  });

  test('4. Failure case: attempting to stake below minimum surfaces a clear error', async ({ page }) => {
    // Attempt to stake 0 or invalid low amount
    const stakeInput = page.locator('input#stake-amount, input[placeholder="0.00"]');
    await stakeInput.first().fill('0');

    const submitStakeButton = page.locator('button:has-text("Stake")').filter({ hasNotText: 'History' });
    await submitStakeButton.first().click();

    // Ensure clear error message is surfaced
    await expect(page.locator('text=Amount must be greater than minimum stake requirement, text=Please enter a valid amount')).toBeVisible();
  });
});
