import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export function generatePDF(claimInfo: any, items: any[]) {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(40, 40, 40);
  doc.text('Claims Inventory Report', 14, 22);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${format(new Date(), 'MMMM d, yyyy')}`, 14, 30);

  // Claim Information
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Claim Information', 14, 45);

  autoTable(doc, {
    startY: 50,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { cellWidth: 100 } },
    body: [
      ['Customer Name:', claimInfo.customerName],
      ['Date of Loss:', claimInfo.dateOfLoss ? format(new Date(claimInfo.dateOfLoss), 'MMMM d, yyyy') : 'N/A'],
      ['Type of Loss:', claimInfo.typeOfLoss],
      ['Claim Number:', claimInfo.claimNumber],
      ['Insurance Company:', claimInfo.insuranceCompany],
      ['Policy Number:', claimInfo.policyNumber],
      ['Adjuster Name:', claimInfo.adjusterName],
    ],
  });

  // Items Table
  const finalY = (doc as any).lastAutoTable.finalY || 100;

  doc.setFontSize(12);
  doc.text('Inventory Items', 14, finalY + 15);

  const tableData = items.map((item, index) => {
    const fullDesc = [
      item.brand,
      item.model,
      item.description
    ].filter(Boolean).join(' ');
    
    const descWithCondition = `${fullDesc}\n(Condition: ${item.condition})`;

    return [
      index + 1,
      item.room,
      descWithCondition,
      `${item.ageYears} yrs`,
      item.currentPrice ? `$${item.currentPrice.toFixed(2)}` : 'N/A',
      item.acv ? `$${item.acv.toFixed(2)}` : 'N/A',
    ];
  });

  const totalRC = items.reduce((sum, item) => sum + (item.currentPrice || 0), 0);
  const totalACV = items.reduce((sum, item) => sum + (item.acv || 0), 0);

  tableData.push([
    '',
    '',
    'TOTAL',
    '',
    `$${totalRC.toFixed(2)}`,
    `$${totalACV.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: finalY + 20,
    head: [['#', 'Room', 'Description', 'Age', 'Replacement Cost', 'Actual Cash Value (ACV)']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 30 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 15 },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 35, halign: 'right' },
    },
    didParseCell: function (data) {
      // Bold the last row (Total)
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 240, 240];
      }
    }
  });

  const disclaimerY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const disclaimerText = "* Disclaimer: All Replacement Costs and Actual Cash Value (ACV) amounts are AI-generated estimates based on current market data and are not guaranteed. Final valuations are subject to adjuster review.";
  const splitDisclaimer = doc.splitTextToSize(disclaimerText, 180);
  doc.text(splitDisclaimer, 14, disclaimerY);

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount} - Bill Layne Insurance Claims Assistant`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }

  doc.save(`Claim_Inventory_${claimInfo.customerName.replace(/\s+/g, '_')}.pdf`);
}
