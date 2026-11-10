// Email is attempted only after the server confirms which credential is active.
export async function deliverResetEmail(result, kind, sendEmail) {
  if (result.delivery !== 'pending') return result;
  if (!result.recipientEmail) return { ...result, delivery: 'failed', deliveryError: 'The account was reset, but the server did not return a recipient email. Copy the active password and update the reset service.' };
  try {
    const response = await sendEmail({ to: result.recipientEmail, temporaryPassword: result.temporaryPassword, accountType: kind });
    if (response?.status !== 200) throw new Error('EmailJS did not confirm that the message was accepted.');
    return { ...result, delivery: 'accepted' };
  } catch (error) {
    return { ...result, delivery: 'failed', deliveryError: `The account was reset, but EmailJS could not confirm the email. ${error?.message || 'Check the EmailJS service and template.'} Copy the active temporary password shown above.` };
  }
}
