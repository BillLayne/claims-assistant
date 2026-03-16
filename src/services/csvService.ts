import { ClaimItem, ClaimInfo } from '../types';

export function exportToCSV(claimInfo: ClaimInfo, items: ClaimItem[]) {
  const headers = [
    'Room/Area', 
    'Item Type/Description', 
    'Brand', 
    'Model', 
    'Condition', 
    'Age (Years)', 
    'Replacement Cost (RC)', 
    'Actual Cash Value (ACV)', 
    'Valuation Explanation'
  ];
  
  const rows = items.map(item => [
    `"${item.room}"`,
    `"${item.description}"`,
    `"${item.brand || ''}"`,
    `"${item.model || ''}"`,
    `"${item.condition}"`,
    item.ageYears,
    item.currentPrice ? item.currentPrice.toFixed(2) : '',
    item.acv ? item.acv.toFixed(2) : '',
    `"${(item.explanation || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [
    `Claim Number: ${claimInfo.claimNumber || 'N/A'}`,
    `Policyholder: ${claimInfo.customerName || 'N/A'}`,
    `Date of Loss: ${claimInfo.dateOfLoss || 'N/A'}`,
    `Insurance Company: ${claimInfo.insuranceCompany || 'N/A'}`,
    '', // Empty row for spacing
    headers.join(','), 
    ...rows.map(r => r.join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `Claim_Inventory_${claimInfo.claimNumber || 'Export'}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
