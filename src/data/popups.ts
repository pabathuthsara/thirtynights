export type PopupDefinition = {
  id: `M${number}`;
  trigger: string;
  title: string;
  body: string;
  actions: string[];
  behavior?: 'sheet' | 'full-screen' | 'caption' | 'automatic';
};

export const popupDefinitions: PopupDefinition[] = [
  { id: 'M1', trigger: 'First record attempt', title: 'We need the microphone.', body: "Only while you're holding the button.", actions: ['Allow', 'Not now'] },
  { id: 'M2', trigger: 'Microphone denied', title: "Without the mic there's no app.", body: 'Turn it on in Settings and come straight back.', actions: ['Open Settings', 'Close'] },
  { id: 'M3', trigger: 'After hour picker', title: 'The app has to reach you.', body: 'One notification a night, at the hour you picked. Nothing else.', actions: ['Allow notifications', 'Not now'], behavior: 'full-screen' },
  { id: 'M4', trigger: 'Notifications denied', title: "You'll have to remember on your own.", body: "Most people don't last a week without the nudge. You can turn it on any time.", actions: ['Open Settings', "I'll remember"] },
  { id: 'M5', trigger: 'Tap a sealed window', title: "It's sealed.", body: 'Every night stays shut until night thirty. That’s what makes night thirty worth it.', actions: ['Alright'] },
  { id: 'M6', trigger: 'Recording under ten seconds', title: 'That was eight seconds.', body: "Sealing it anyway is fine. But you've got ninety.", actions: ['Seal it', 'Try again'] },
  { id: 'M7', trigger: 'Leave during recording', title: 'Leave without sealing?', body: 'Nothing gets saved. Tonight stays empty.', actions: ['Keep recording', 'Leave'] },
  { id: 'M8', trigger: 'Report generation', title: 'Reading thirty nights.', body: 'Recording · Transcribing · Finding the thread · Cutting the report', actions: [], behavior: 'full-screen' },
  { id: 'M9', trigger: 'Report generation failed', title: 'Something broke on our side.', body: 'Your recordings are safe. Try again in a minute.', actions: ['Try again', 'Close'] },
  { id: 'M10', trigger: 'Three or more missed nights', title: 'You missed four nights.', body: "They stay empty and that's fine. The report works on what's there.", actions: ["Tonight's question"] },
  { id: 'M11', trigger: 'After the seven-night report', title: 'That was seven.', body: 'The thread only shows up over thirty.', actions: ['Continue — $9', 'Not yet'] },
  { id: 'M12', trigger: 'Delete everything', title: 'Delete all thirty nights?', body: "Every recording, every transcript, every report. This can't be undone.", actions: ['Delete', 'Cancel'] },
  { id: 'M13', trigger: 'Second delete confirmation', title: 'Type DELETE to confirm.', body: 'Enter DELETE before permanent removal.', actions: ['Delete forever', 'Cancel'] },
  { id: 'M14', trigger: 'Restore found nothing', title: 'Nothing to restore.', body: "We couldn't find a purchase on this Apple ID.", actions: ['Close'] },
  { id: 'M15', trigger: 'Device storage low', title: 'Your phone is nearly full.', body: 'Recordings need about a megabyte a night.', actions: ['Alright'] },
  { id: 'M16', trigger: 'Backup waiting while offline', title: 'Backup pending', body: 'Two nights waiting to back up.', actions: [], behavior: 'caption' },
  { id: 'M17', trigger: 'Sign out with local recordings', title: "Three nights aren't backed up yet.", body: 'Sign out now and they stay only on this phone.', actions: ['Back up first', 'Sign out anyway'] },
  { id: 'M18', trigger: 'Reminder changed after 8 PM', title: "Tonight's reminder already went out.", body: 'The new time starts tomorrow.', actions: ['Got it'] },
  { id: 'M19', trigger: 'Recording reaches five minutes', title: 'Five minutes.', body: "That's the cap. Sealing now.", actions: [], behavior: 'automatic' },
  { id: 'M20', trigger: 'After sealing night three', title: 'Want these backed up?', body: 'Right now your three nights live only on this phone. An account keeps them if you lose it.', actions: ['Create account', 'Later'] },
  { id: 'M21', trigger: 'Purchase while anonymous', title: "You'll need an account first.", body: 'So your chapter survives a new phone.', actions: ['Continue'] },
  { id: 'M22', trigger: 'Duplicate email during signup', title: 'That email already has an account.', body: 'Sign in to continue or use another email.', actions: ['Sign in', 'Use another email'] },
  { id: 'M23', trigger: 'Interrupted purchase recovered', title: 'Your chapter is open.', body: 'The purchase went through.', actions: ['Start night 8'] },
  { id: 'M24', trigger: 'Ask-to-Buy pending', title: 'Waiting on approval.', body: "We'll open the chapter as soon as it comes through.", actions: ['Alright'] },
  { id: 'M25', trigger: 'Account deletion', title: 'Delete your account?', body: "This removes your account and every recording. Purchases can't be transferred after this.", actions: ['Delete', 'Cancel'] },
];
