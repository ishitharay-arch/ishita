const db = require('better-sqlite3')('./data/eval.db');
const bot = db.prepare('SELECT id FROM bots WHERE name = ?').get('Sameeksha');
if (!bot) { console.log('Bot "Sameeksha" not found. Create it first.'); process.exit(1); }

const cases = [

  // ===== FLOW 1: Appointment already scheduled =====
  {
    id: 'PEHC-01',
    scenario_type: 'flow1_appointment_exists',
    priority: 'P0',
    description: 'Caller has a scheduled appointment. Bot should confirm details and close.',
    must_say: ['appointment', 'scheduled'],
    must_not_say: ['email', 'unable', 'failed', 'ticket'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-02',
    scenario_type: 'flow1_caller_says_yes_to_number',
    priority: 'P0',
    description: 'Caller confirms the number bot reads out. Bot should fetch details using that number.',
    must_say: ['mobile number', 'booking'],
    must_not_say: ['unable', 'failed'],
    expected_tools: [],
    expect_terminal_state: false
  },

  // ===== FLOW 2: E-sales booking created, not yet scheduled =====
  {
    id: 'PEHC-03',
    scenario_type: 'flow2_esales_booking',
    priority: 'P0',
    description: 'E-sales booking exists but no appointment. Bot must raise ticket and say 24 hours.',
    must_say: ['booking', 'initiated', 'ticket', '24 hours'],
    must_not_say: ['email', 'unable', 'no booking'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-04',
    scenario_type: 'flow2_esales_no_ticket_mention',
    priority: 'P0',
    description: 'E-sales flow — bot must not skip the ticket raise step.',
    must_say: ['ticket'],
    must_not_say: ['unable', 'failed'],
    expected_tools: [],
    expect_terminal_state: false
  },

  // ===== FLOW 3: No booking found — identity =====
  {
    id: 'PEHC-05',
    scenario_type: 'flow3_no_booking_ask_company',
    priority: 'P0',
    description: 'No booking found. Bot must ask which company: Jio, Non-Jio, or Other.',
    must_say: ['booking', 'company', 'Jio'],
    must_not_say: ['appointment has been scheduled', 'unable'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-06',
    scenario_type: 'flow3_caller_says_no_to_number',
    priority: 'P1',
    description: 'Caller says the number is wrong. Bot should ask for the correct number.',
    must_say: ['mobile number', 'number'],
    must_not_say: ['unable', 'failed'],
    expected_tools: [],
    expect_terminal_state: false
  },

  // ===== FLOW 3A: Reliance Jio =====
  {
    id: 'PEHC-07',
    scenario_type: 'flow3a_jio_happy_path',
    priority: 'P0',
    description: 'Jio customer, no booking. Bot must mention app/portal booking and offer WhatsApp guide.',
    must_say: ['app', 'WhatsApp', 'booking'],
    must_not_say: ['email to MediBuddy', 'unable', 'failed', 'HR'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-08',
    scenario_type: 'flow3a_jio_must_mention_hr_credentials',
    priority: 'P0',
    description: 'Jio flow — bot must tell caller that HR shares login credentials via email.',
    must_say: ['HR', 'credentials'],
    must_not_say: ['unable', 'failed'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-09',
    scenario_type: 'flow3a_jio_must_ask_whatsapp',
    priority: 'P0',
    description: 'Jio flow — bot must mandatorily ask if caller wants WhatsApp guide, not skip it.',
    must_say: ['WhatsApp'],
    must_not_say: ['unable', 'failed'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-10',
    scenario_type: 'flow3a_jio_exception_cant_book',
    priority: 'P0',
    description: 'Jio caller unable to book. Bot must raise ticket to After Sales and inform them.',
    must_say: ['ticket', 'team', 'contact'],
    must_not_say: ['unable', 'failed'],
    expected_tools: [],
    expect_terminal_state: false
  },

  // ===== FLOW 3B: Reliance Non-Jio =====
  {
    id: 'PEHC-11',
    scenario_type: 'flow3b_nonjio_ask_email_sent',
    priority: 'P0',
    description: 'Non-Jio, no booking. Bot must ask if email has been sent to MediBuddy.',
    must_say: ['email', 'MediBuddy'],
    must_not_say: ['app', 'portal', 'HR team must share'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-12',
    scenario_type: 'flow3b_nonjio_email_sent_within_24h',
    priority: 'P0',
    description: 'Non-Jio, email sent within 24 hours. Bot must say team is processing, allow 24 hours.',
    must_say: ['processing', '24 hours'],
    must_not_say: ['send an email', 'transfer', 'agent', 'unable'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-13',
    scenario_type: 'flow3b_nonjio_email_sent_over_24h',
    priority: 'P0',
    description: 'Non-Jio, email sent over 24 hours ago. Bot must escalate and transfer to live agent.',
    must_say: ['escalate', 'transfer'],
    must_not_say: ['send an email', 'WhatsApp template'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-14',
    scenario_type: 'flow3b_nonjio_email_not_sent',
    priority: 'P0',
    description: 'Non-Jio, email not sent. Bot must explain email process and offer WhatsApp template.',
    must_say: ['email', 'WhatsApp', '24 hours'],
    must_not_say: ['unable', 'failed', 'transfer', 'agent'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-15',
    scenario_type: 'flow3b_nonjio_must_ask_whatsapp',
    priority: 'P0',
    description: 'Non-Jio email not sent — bot must mandatorily ask about WhatsApp, not skip it.',
    must_say: ['WhatsApp'],
    must_not_say: ['unable'],
    expected_tools: [],
    expect_terminal_state: false
  },

  // ===== FLOW 3C: Other Corporates =====
  {
    id: 'PEHC-16',
    scenario_type: 'flow3c_other_corp',
    priority: 'P0',
    description: 'Other corporate. Bot must tell caller to contact their HR to send email to MediBuddy.',
    must_say: ['HR', 'email', 'preemphealthcheck'],
    must_not_say: ['app', 'portal', 'Jio', 'unable'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-17',
    scenario_type: 'flow3c_other_corp_hr_already_emailed',
    priority: 'P0',
    description: 'Other corp, HR already sent email. Bot must escalate and transfer to live agent.',
    must_say: ['escalate', 'transfer'],
    must_not_say: ['send an email', 'unable'],
    expected_tools: [],
    expect_terminal_state: false
  },

  // ===== GENERAL EXCEPTIONS =====
  {
    id: 'PEHC-18',
    scenario_type: 'exception_booking_link_issue',
    priority: 'P0',
    description: 'Caller has link issues. Bot must apologize, raise ticket to After Sales.',
    must_say: ['ticket', 'After Sales'],
    must_not_say: ['unable'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-19',
    scenario_type: 'exception_payment_expired',
    priority: 'P0',
    description: 'Payment link expired. Bot must apologize and raise ticket.',
    must_say: ['ticket'],
    must_not_say: ['unable'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-20',
    scenario_type: 'exception_slot_unavailable',
    priority: 'P1',
    description: 'Caller says slots are not available. Bot must raise ticket to After Sales.',
    must_say: ['ticket'],
    must_not_say: ['unable'],
    expected_tools: [],
    expect_terminal_state: false
  },

  // ===== REGRESSION / QUALITY CHECKS =====
  {
    id: 'PEHC-21',
    scenario_type: 'regression_no_loop',
    priority: 'P0',
    description: 'Bot must not repeat the same sentence twice in a row (looping bug).',
    must_say: [],
    must_not_say: [],
    expected_tools: [],
    expect_terminal_state: false,
    custom_check: 'no_repeat'
  },
  {
    id: 'PEHC-22',
    scenario_type: 'regression_jio_not_told_email',
    priority: 'P0',
    description: 'Jio caller must NOT be told to send email — that is the Non-Jio flow.',
    must_say: ['app', 'WhatsApp'],
    must_not_say: ['send an email', 'email to MediBuddy', 'preemphealthcheck@'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-23',
    scenario_type: 'regression_nonjio_not_told_app',
    priority: 'P0',
    description: 'Non-Jio caller must NOT be told to use the app — that is the Jio flow.',
    must_say: ['email'],
    must_not_say: ['MediBuddy App', 'portal', 'login credentials'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-24',
    scenario_type: 'regression_whatsapp_number_confirmed',
    priority: 'P1',
    description: 'Before sending WhatsApp, bot must confirm the WhatsApp number.',
    must_say: ['WhatsApp number', 'number'],
    must_not_say: ['unable'],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-25',
    scenario_type: 'regression_24h_mentioned',
    priority: 'P1',
    description: 'When raising a ticket or saying team will respond, bot must mention 24 hours.',
    must_say: ['24 hours'],
    must_not_say: ['unable'],
    expected_tools: [],
    expect_terminal_state: false
  },
];

// Insert all test cases
const insert = db.prepare(`
  INSERT OR IGNORE INTO test_cases (id, bot_id, spec, approved_by, approved_at)
  VALUES (?, ?, ?, 'manual', datetime('now'))
`);

let added = 0;
for (const tc of cases) {
  try {
    insert.run(tc.id, bot.id, JSON.stringify(tc));
    added++;
  } catch (e) {
    console.log(`Skipped ${tc.id}: ${e.message}`);
  }
}

console.log(`Added ${added} test cases out of ${cases.length}`);
console.log('Total test cases for Sameeksha:', 
  db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE bot_id = ?').get(bot.id).count
);
