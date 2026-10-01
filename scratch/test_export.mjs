import fs from 'fs';
import { jsPDF } from 'jspdf';

const logoBase64 = fs.readFileSync('src/imports/sti_logo_base64.txt', 'utf8').trim();

console.log('Logo base64 length:', logoBase64.length);

const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
});

const pageWidth = 210;
const pageHeight = 297;
const margin = 15;
const contentWidth = pageWidth - margin * 2; // 180mm
const colLabelW = 38;
const colContentW = 142;
const xLabel = margin;
const xContent = margin + colLabelW;
const maxPageY = pageHeight - margin;

let y = margin;

// Add Logo
doc.addImage(logoBase64, 'JPEG', margin, y, 38.9, 10.7);

// Add Date
doc.setFont('helvetica', 'normal');
doc.setFontSize(10);
doc.setTextColor(0, 0, 0);
doc.text('Date: September 9, 2026', margin + contentWidth, y + 6.5, { align: 'right' });

y += 16;

// Title
doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.setTextColor(0, 0, 0);
doc.text('Activity Proposal', margin, y);

y += 5.5;

function ensureSpace(neededHeight) {
  if (y + neededHeight > maxPageY) {
    doc.addPage();
    y = margin;
  }
}

function renderRow(label, contentLinesInput, options = {}) {
  const labelLines = doc.splitTextToSize(label, colLabelW - 5);
  const linesArray = Array.isArray(contentLinesInput)
    ? contentLinesInput.flatMap((str) => doc.splitTextToSize(str, colContentW - 6))
    : doc.splitTextToSize(contentLinesInput || '—', colContentW - 6);

  const lineHeight = 3.9;
  const textH = Math.max(labelLines.length, linesArray.length) * lineHeight;
  const rowH = Math.max(7.2, textH + 4.2);

  ensureSpace(rowH);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(xLabel, y, colLabelW, rowH);
  doc.rect(xContent, y, colContentW, rowH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(labelLines, xLabel + 2.5, y + 2.5 + 2.9);

  doc.setFont('helvetica', options.boldContent ? 'bold' : 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(linesArray, xContent + 2.5, y + 2.5 + 2.9);

  y += rowH;
}

renderRow('Activity title:', 'IT Expert Talk #1: Cybersecurity Awareness and Ethical Hacking', { boldContent: true });
renderRow('Description:', 'This activity aims to provide students with relevant knowledge and practical insights on cybersecurity and ethical hacking through an expert-led seminar. The session will be divided into two learning tracks: Cybersecurity Awareness for Senior High School students and Ethical Hacking Fundamentals for BSIT students. The resource speaker from the Ormoc City Cyber Response Team (OCCRT) will discuss current cyber threats, online safety practices, digital responsibility, and the role of ethical hackers in protecting information systems.');
renderRow('Organizer/s:', 'IT Department and IT Guild Club');
renderRow('Objective/s:', [
  '• Increasing awareness of common cyber threats and cybersecurity best practices',
  '• Introducing fundamental concepts and ethical considerations in ethical hacking',
  '• Fostering cybersecurity consciousness among students and inspiring careers in IT security'
]);
renderRow('Success indicator/s:', [
  '• At least 90% of registered participants attended the activity.',
  '• Participants demonstrated active engagement during Q&A session.',
  '• Overall evaluation rating of 4.5 or higher from student participants.'
]);
renderRow('Mechanics:', [
  '(List the mechanics and/or procedures in detail. Attach sheets, if necessary.)',
  '1. Registration and Attendance Verification (8:00 AM - 8:30 AM)',
  '2. Opening Program and Welcome Address (8:30 AM - 9:00 AM)',
  '3. Morning Session: Cybersecurity Awareness for SHS (9:00 AM - 12:00 PM)',
  '4. Afternoon Session: Ethical Hacking Fundamentals for BSIT (1:00 PM - 4:00 PM)',
  '5. Open Forum, Awarding of Certificates, and Closing Remarks (4:00 PM - 5:00 PM)'
]);
renderRow('Materials:', 'Function Hall / AVR / Multi-Purpose Hall, Laptop and Projector, Sound System, Internet Connection, Certificates');
renderRow('Target market:', 'All Grade 12 SHS, BSIT 3rd Year, BSIT 4th Year Students - College & SHS');
renderRow('Est. attendance:', '150–250 Participants');
renderRow('Marketing plan:', [
  '• Announcement through official school Facebook page',
  '• Posting of digital promotional materials on student bulletin channels',
  '• Coordination with SHS and College faculty advisers'
]);
renderRow('Documentation:', [
  '• Attendance Records and Evaluation Survey Results',
  '• Comprehensive Photo and Video Coverage',
  '• Post-Activity Completion and Liquidation Report'
]);
renderRow('Date & time:', 'October 13, 2026 (8:00 AM – 5:00 PM)');
renderRow('Venue:', 'New rooms, STI College Ormoc');

// Footnote
y += 4;
doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(0, 0, 0);
doc.text('Note: This proposal must be submitted to the Administrator at least 15 calendar days before the start of the initial task.', margin, y);

const pdfBytes = doc.output('arraybuffer');
fs.writeFileSync('scratch/test_output.pdf', Buffer.from(pdfBytes));
console.log('PDF generated successfully! File size:', pdfBytes.byteLength, 'bytes. Pages:', doc.getNumberOfPages());
