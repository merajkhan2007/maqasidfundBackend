import cron from 'node-cron';
import prisma from './lib/prisma';

export const startCronJobs = () => {
    // Run every day at checking 00:00 AM
    cron.schedule('0 0 * * *', async () => {
        console.log('[CRON] Starting daily loan interest check...');
        try {
            // Find all APPROVED loans that have an approvedAt date
            const activeLoans = await prisma.loan.findMany({
                where: {
                    status: 'APPROVED',
                    approvedAt: { not: null },
                    remainingBalance: { gt: 0 }
                }
            });

            const now = new Date();
            let updatedCount = 0;

            for (const loan of activeLoans) {
                if (!loan.approvedAt) continue;

                // Calculate the difference in months
                const monthsSinceApproval =
                    (now.getFullYear() - loan.approvedAt.getFullYear()) * 12 +
                    (now.getMonth() - loan.approvedAt.getMonth());

                // Check if it's past the 3-month grace period
                if (monthsSinceApproval >= 3) {
                    // Handle end-of-month edge cases (e.g., loan on Jan 31st, checking in Feb (28/29 days))
                    const lastDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                    const targetDay = Math.min(loan.approvedAt.getDate(), lastDayOfCurrentMonth);

                    if (now.getDate() === targetDay) {
                        const fee = loan.remainingBalance! * 0.02; // 2% fee

                        await prisma.$transaction(async (tx) => {
                            await tx.loan.update({
                                where: { id: loan.id },
                                data: {
                                    remainingBalance: loan.remainingBalance! + fee
                                }
                            });

                            await tx.notification.create({
                                data: {
                                    userId: loan.userId,
                                    title: 'Monthly Loan Interest Applied',
                                    message: `A 2% monthly interest fee of ₹${fee.toFixed(2)} has been added to your loan #${loan.id} remaining balance.`,
                                    type: 'EMI_REMINDER'
                                }
                            });
                        });

                        console.log(`[CRON] Added 2% fee (₹${fee.toFixed(2)}) to Loan #${loan.id}`);
                        updatedCount++;
                    }
                }
            }

            console.log(`[CRON] Finished daily loan check. Updated ${updatedCount} loans.`);
        } catch (error) {
            console.error('[CRON] Error during loan interest check:', error);
        }
    });

    console.log('[CRON] Jobs scheduled.');
};
