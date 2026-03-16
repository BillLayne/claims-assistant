export type ClaimInfo = {
  customerName: string;
  dateOfLoss: string;
  claimNumber: string;
  insuranceCompany: string;
  adjusterName: string;
  policyNumber: string;
  typeOfLoss: string;
};

export type ClaimItem = {
  id: string;
  room: string;
  description: string;
  brand?: string;
  model?: string;
  condition: string;
  ageYears: number;
  status: 'pending' | 'loading' | 'complete' | 'error';
  currentPrice?: number;
  usefulLifeYears?: number;
  acv?: number;
  explanation?: string;
  sourceUrl?: string;
  image?: {
    data: string;
    mimeType: string;
  };
};
