export type PopupDefinition = {
  id: `M${number}`;
  trigger: string;
  title: string;
  body: string;
  actions: string[];
  behavior?: 'sheet' | 'full-screen' | 'caption' | 'automatic';
};

export const popupDefinitions: PopupDefinition[] = [
  { id: 'M1', trigger: 'First record attempt', title: 'Microphone access', body: 'Used only while recording.', actions: ['Allow', 'Not now'] },
  { id: 'M2', trigger: 'Microphone denied', title: 'Microphone access is off.', body: 'Enable it in Settings, then return.', actions: ['Open Settings', 'Close'] },
  { id: 'M3', trigger: 'After hour picker', title: 'Allow a nightly reminder?', body: 'At the time you chose. No promotions.', actions: ['Allow notifications', 'Not now'], behavior: 'full-screen' },
  { id: 'M4', trigger: 'Notifications denied', title: 'Reminders are off.', body: 'Enable them later in Settings.', actions: ['Open Settings', 'Not now'] },
  { id: 'M5', trigger: 'Tap a sealed window', title: 'Sealed until night 30.', body: 'It opens with your reflection.', actions: ['Alright'] },
  { id: 'M6', trigger: 'Recording under ten seconds', title: 'Eight seconds.', body: 'Short is fine. Seal it or try again.', actions: ['Seal it', 'Try again'] },
  { id: 'M7', trigger: 'Leave during recording', title: 'Leave without sealing?', body: 'This take will not be saved.', actions: ['Keep recording', 'Leave'] },
  { id: 'M8', trigger: 'Report generation', title: 'Reading thirty nights.', body: 'Transcribing · Finding the thread · Writing', actions: [], behavior: 'full-screen' },
  { id: 'M9', trigger: 'Report generation failed', title: "We couldn't finish the report.", body: 'Your recordings are safe. Try again soon.', actions: ['Try again', 'Close'] },
  { id: 'M10', trigger: 'Three or more missed nights', title: 'Four nights stayed empty.', body: 'The report uses the nights you kept.', actions: ["Tonight's question"] },
  { id: 'M11', trigger: 'After the seven-night report', title: 'Seven nights kept.', body: 'Continue to night 30 with one payment.', actions: ['Continue — $9', 'Not yet'] },
  { id: 'M12', trigger: 'Delete everything', title: 'Delete all thirty nights?', body: "Every recording, every transcript, every report. This can't be undone.", actions: ['Delete', 'Cancel'] },
  { id: 'M13', trigger: 'Second delete confirmation', title: 'Type DELETE to confirm.', body: 'Enter DELETE before permanent removal.', actions: ['Delete forever', 'Cancel'] },
  { id: 'M14', trigger: 'Restore found nothing', title: 'Nothing to restore.', body: "We couldn't find a purchase on this Apple ID.", actions: ['Close'] },
  { id: 'M15', trigger: 'Device storage low', title: 'Storage is low.', body: 'Recordings need about 1 MB per night.', actions: ['Alright'] },
  { id: 'M16', trigger: 'Backup waiting while offline', title: 'Backup pending', body: 'Two nights waiting to back up.', actions: [], behavior: 'caption' },
  { id: 'M17', trigger: 'Sign out with local recordings', title: "Three nights aren't backed up.", body: 'Signing out leaves them on this phone.', actions: ['Back up first', 'Sign out anyway'] },
  { id: 'M18', trigger: 'Reminder changed after 8 PM', title: "Tonight's reminder already went out.", body: 'The new time starts tomorrow.', actions: ['Got it'] },
  { id: 'M19', trigger: 'Recording reaches five minutes', title: 'Five minutes.', body: "That's the cap. Sealing now.", actions: [], behavior: 'automatic' },
  { id: 'M20', trigger: 'After sealing night three', title: 'Back up your nights?', body: 'An account protects them if this phone is lost.', actions: ['Create account', 'Later'] },
  { id: 'M21', trigger: 'Purchase while anonymous', title: 'Create an account first.', body: 'It keeps your purchase and chapter together.', actions: ['Continue'] },
  { id: 'M22', trigger: 'Duplicate email during signup', title: 'That email already has an account.', body: 'Sign in to continue or use another email.', actions: ['Sign in', 'Use another email'] },
  { id: 'M23', trigger: 'Interrupted purchase recovered', title: 'Your chapter is open.', body: 'The purchase went through.', actions: ['Start night 8'] },
  { id: 'M24', trigger: 'Ask-to-Buy pending', title: 'Waiting on approval.', body: "We'll open the chapter as soon as it comes through.", actions: ['Alright'] },
  { id: 'M25', trigger: 'Account deletion', title: 'Delete your account?', body: "Removes the account and all recordings. Purchases can't transfer.", actions: ['Delete', 'Cancel'] },
];
