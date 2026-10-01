import fs from 'fs';
import { jsPDF } from 'jspdf';

const logoBase64 = fs.readFileSync('src/imports/sti_logo_base64.txt', 'utf8').trim();

const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
});

const pageWidth = 210;
const pageHeight = 297;
const marginL = 18;
const marginR = 18;
const marginT = 14;
const marginB = 14;
const contentW = pageWidth - marginL - marginR; // 174mm
const colLabelW = 36;
const colContentW = contentW - colLabelW; // 138mm
const xLabel = marginL; // 18mm
const xContent = marginL + colLabelW; // 54mm
const xRight = marginL + contentW; // 192mm
const maxPageY = pageHeight - marginB; // 283mm

let y = marginT;

// 1. Header (Logo + Date)
doc.addImage(logoBase64, 'JPEG', marginL, y, 38.9, 10.7);

doc.setFont('helvetica', 'normal');
doc.setFontSize(9.5);
doc.setTextColor(0, 0, 0);

const dateStr = 'September 9, 2026';
doc.text('Date:', xRight - 65, y + 6.5);
doc.text(dateStr, xRight - 53, y + 6.5);
doc.setDrawColor(0, 0, 0);
doc.setLineWidth(0.2);
doc.line(xRight - 55, y + 7.5, xRight, y + 7.5);

y += 16;

// 2. Title: Activity Proposal
doc.setFont('helvetica', 'bold');
doc.setFontSize(11);
doc.setTextColor(0, 0, 0);
doc.text('Activity Proposal', marginL, y);

y += 5.5;

function ensureSpace(neededHeight) {
  if (y + neededHeight > maxPageY) {
    doc.addPage();
    y = marginT;
  }
}

function renderField(label, content, options = {}) {
  const labelLines = doc.splitTextToSize(label, colLabelW - 3);
  const contentLines = Array.isArray(content)
    ? content.flatMap((s) => doc.splitTextToSize(s, colContentW - 2))
    : doc.splitTextToSize(content || '', colContentW - 2);

  const lineHeight = 3.8;
  const contentTextH = Math.max(1, contentLines.length) * lineHeight;
  const rowHeight = Math.max(5.5, contentTextH + 2.5);

  ensureSpace(rowHeight);

  // Label (left, bold, NO BORDER)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(labelLines, xLabel, y + 3.2);

  // Content (right, normal or bold)
  doc.setFont('helvetica', options.boldContent ? 'bold' : 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  if (contentLines.length > 0) {
    doc.text(contentLines, xContent, y + 3.2);
  }

  // Horizontal Underline under the right column (matching AP_FORMAT_EMPTY)
  const lineY = y + contentTextH + 1.0;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(xContent, lineY, xRight, lineY);

  y = lineY + 2.5; // Spacing before next row
}

renderField('Activity title:', 'IT Expert Talk #1: Cybersecurity Awareness and Ethical Hacking', { boldContent: true });
renderField('Description:', 'This activity aims to provide students with relevant knowledge and practical insights on cybersecurity and ethical hacking through an expert-led seminar. The session will be divided into two learning tracks: Cybersecurity Awareness for Senior High School students and Ethical Hacking Fundamentals for BSIT students. The resource speaker from the Ormoc City Cyber Response Team (OCCRT) will discuss current cyber threats, online safety practices, digital responsibility, and the role of ethical hackers in protecting information systems.');
renderField('Organizer/s:', 'IT Department and IT Guild Club');
renderField('Objective/s:', [
  '• Increasing awareness of common cyber threats and cybersecurity best practices',
  '• Introducing fundamental concepts and ethical considerations in ethical hacking',
  '• Fostering cybersecurity consciousness among students and inspiring careers in IT security'
]);
renderField('Success indicator/s:', [
  '• At least 90% of registered participants attended the activity.',
  '• Participants demonstrated active engagement during Q&A session.',
  '• Overall evaluation rating of 4.5 or higher from student participants.'
]);
renderField('Mechanics:', [
  '(List the mechanics and/or procedures in detail. Attach sheets, if necessary.)',
  '1. Registration and Attendance Verification (8:00 AM - 8:30 AM)',
  '2. Opening Program and Welcome Address (8:30 AM - 9:00 AM)',
  '3. Morning Session: Cybersecurity Awareness for SHS (9:00 AM - 12:00 PM)',
  '4. Afternoon Session: Ethical Hacking Fundamentals for BSIT (1:00 PM - 4:00 PM)',
  '5. Open Forum, Awarding of Certificates, and Closing Remarks (4:00 PM - 5:00 PM)'
]);
renderField('Materials:', 'Function Hall / AVR / Multi-Purpose Hall, Laptop and Projector, Sound System, Internet Connection, Certificates');
renderField('Target market:', 'All Grade 12 SHS, BSIT 3rd Year, BSIT 4th Year Students - College & SHS');
renderField('Est. attendance:', '150–250 Participants');
renderField('Marketing plan:', [
  '• Announcement through official school Facebook page',
  '• Posting of digital promotional materials on student bulletin channels',
  '• Coordination with SHS and College faculty advisers'
]);
renderField('Documentation:', [
  '• Attendance Records and Evaluation Survey Results',
  '• Comprehensive Photo and Video Coverage',
  '• Post-Activity Completion and Liquidation Report'
]);
renderField('Date & time:', 'October 13, 2026 (8:00 AM – 5:00 PM)');
renderField('Venue:', 'New rooms, STI College Ormoc');

// ─── TASK LIST ──────────────────────────────────────────────────────────────
ensureSpace(25);
doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(0, 0, 0);
doc.text('Task list:', xLabel, y + 3.2);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.5);
doc.text('(List all involved tasks chronologically. Attach sheets, if necessary.)', xContent, y + 3.2);
y += 6.5;

// Headers
const colTaskW = 60;
const colPersonW = 45;
const colDateW = 33;

doc.setFont('helvetica', 'bold');
doc.setFontSize(8);
doc.text('Task', xContent, y + 2.5);
doc.text('Person Assigned', xContent + colTaskW, y + 2.5);
doc.text('Date to be Completed', xContent + colTaskW + colPersonW, y + 2.5);

doc.setDrawColor(0, 0, 0);
doc.setLineWidth(0.2);
doc.line(xContent, y + 4.0, xRight, y + 4.0);
y += 5.5;

const sampleTasks = [
  { task: 'Secure Venue and Laboratory', person: 'IT Program Head/Club Adviser', date: 'September 28, 2026' },
  { task: 'Coordinate with OCCRT Speaker', person: 'IT Program Head/Club Adviser', date: 'September 28, 2026' },
  { task: 'Prepare Invitation Letter', person: 'IT Guild Club Officers', date: 'September 29, 2026' },
  { task: 'Design Promotional Materials', person: 'Rule of Fives (Media Team)', date: 'October 1, 2026' },
  { task: 'Registration and Participant Coordination', person: 'IT Guild Club officers', date: 'October 1 - 10, 2026' }
];

doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
sampleTasks.forEach((t) => {
  ensureSpace(5.5);
  doc.text(t.task, xContent, y + 2.5);
  doc.text(t.person, xContent + colTaskW, y + 2.5);
  doc.text(t.date, xContent + colTaskW + colPersonW, y + 2.5);
  y += 4.5;
});

// Underline bottom of Task list
doc.line(xContent, y + 1.0, xRight, y + 1.0);
y += 3.5;

// ─── FINANCIAL PROJECTIONS ──────────────────────────────────────────────────
ensureSpace(28);
doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.text('Financial projections:', xLabel, y + 3.2);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.5);
doc.text('(Anticipate all possible costs for an accurate budget proposal.)', xContent, y + 3.2);
y += 6.5;

// Financial Headers
const fDescW = 44;
const fLastW = 20;
const fThisW = 22;
const fTotW = 20;
const fAdjW = 16;
const fRemW = 16;

doc.setFont('helvetica', 'bold');
doc.setFontSize(7);
doc.text('Description', xContent, y + 2.5);
doc.text('LAST YEAR', xContent + fDescW, y + 1.5);
doc.text('ACTUAL BUDGET', xContent + fDescW, y + 4.2);
doc.text('THIS YEAR', xContent + fDescW + fLastW, y + 1.5);
doc.text('PROPOSED BUDGET', xContent + fDescW + fLastW, y + 4.2);
doc.text('Total Amount', xContent + fDescW + fLastW + fThisW, y + 2.5);
doc.text('ADJUSTMENT', xContent + fDescW + fLastW + fThisW + fTotW, y + 2.5);
doc.text('REMARKS', xContent + fDescW + fLastW + fThisW + fTotW + fAdjW, y + 2.5);

doc.line(xContent, y + 5.5, xRight, y + 5.5);
y += 7.0;

// Expense items
const sampleExpenses = [
  { desc: 'Speaker token (2 pax)', last: '2,000.00', thisP: '2,500.00', tot: '2,500.00', adj: '500.00', rem: '' },
  { desc: 'Snacks for Speaker (4 speaker * 100)', last: '2,200.00', thisP: '800.00', tot: '800.00', adj: '1,400.00', rem: '' },
  { desc: 'Lunch (speakers) (4 speakers * 150)', last: '2,200.00', thisP: '600.00', tot: '600.00', adj: '1,600.00', rem: '' },
  { desc: 'Tarpaulin printing', last: '1,500.00', thisP: '1,500.00', tot: '1,500.00', adj: '0.00', rem: '' },
  { desc: 'Print certificates', last: '1,000.00', thisP: '1,200.00', tot: '1,200.00', adj: '200.00', rem: '' },
  { desc: 'Contingency Fund', last: '2,000.00', thisP: '2,000.00', tot: '2,000.00', adj: '2,000.00', rem: '' }
];

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);
sampleExpenses.forEach((exp) => {
  ensureSpace(4.5);
  doc.text(exp.desc, xContent, y + 2.2);
  doc.text(exp.last, xContent + fDescW + fLastW - 2, y + 2.2, { align: 'right' });
  doc.text(exp.thisP, xContent + fDescW + fLastW + fThisW - 2, y + 2.2, { align: 'right' });
  doc.text(exp.tot, xContent + fDescW + fLastW + fThisW + fTotW - 2, y + 2.2, { align: 'right' });
  doc.text(exp.adj, xContent + fDescW + fLastW + fThisW + fTotW + fAdjW - 2, y + 2.2, { align: 'right' });
  doc.text(exp.rem, xContent + fDescW + fLastW + fThisW + fTotW + fAdjW + 2, y + 2.2);
  y += 4.5;
});

// Total Expenses
ensureSpace(12);
doc.line(xContent, y + 1.0, xRight, y + 1.0);
y += 3.0;

doc.setFont('helvetica', 'bold');
doc.setFontSize(7.5);
doc.text('Total Expenses:', xContent, y + 2.2);
doc.text('8,600.00', xContent + fDescW + fLastW + fThisW - 2, y + 2.2, { align: 'right' });
y += 5.0;

// Balance
doc.text('Balance (Revenue less Expenses):  P 41,400.00', xContent, y + 2.2);
y += 4.0;
doc.line(xContent, y + 1.0, xRight, y + 1.0);
y += 3.5;

// ─── SIGNATORIES ────────────────────────────────────────────────────────────
function renderSignatory(label, names) {
  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(label, xLabel, y + 3.2);

  const slotW = (colContentW - 6) / names.length;
  names.forEach((sig, idx) => {
    const slotX = xContent + idx * slotW;
    const lineY = y + 8.5;
    doc.setLineWidth(0.2);
    doc.line(slotX, lineY, slotX + Math.min(65, slotW - 6), lineY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(sig.name, slotX, lineY + 4.0);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(sig.title, slotX, lineY + 7.5);
  });

  y += 18;
}

renderSignatory('Proposed by:', [{ name: 'Rona Mira B. Lucañas', title: 'IT Program Head' }]);
renderSignatory('Endorsed by:', [
  { name: 'Humabona L. Gonzales', title: 'Academic Head' },
  { name: 'Engr. Sheena Joy S. Muyuela', title: 'School Administrator' }
]);
renderSignatory('Approved by:', [{ name: 'Atty. Antonio R. Lucero Jr.', title: 'School President' }]);

// Footnote
ensureSpace(8);
doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(0, 0, 0);
doc.text('Note: This proposal must be submitted to the Administrator at least 15 calendar days before the start of the initial task.', marginL, y);

const pdfBytes = doc.output('arraybuffer');
fs.writeFileSync('scratch/test_empty_format.pdf', Buffer.from(pdfBytes));
console.log('Complete Test PDF generated with exact AP_FORMAT_EMPTY layout! Size:', pdfBytes.byteLength, 'bytes, Pages:', doc.getNumberOfPages());
