export type MiscFeeSemesterTerm = '1st Semester' | '2nd Semester';
export type MiscFeeHeadcountSource = 'student_registry' | 'template_override';

export interface MiscFeeBucket {
  id: string;
  particular: string;
  assessmentType: 'Assessment' | 'Non-Assessment' | string;
  mfType: string;
  mfTitle: string;
  program: string;
  level: string;
  remarks: string;
  saoEligible: boolean;
  shsRateLY: number;
  shsRateTY: number;
  college1stSemRateLY: number;
  college1stSemRateTY: number;
  college2ndSemRateLY: number;
  college2ndSemRateTY: number;
  carryOverFrom1stSem: number;
  disbursed1stSem: number;
  returnedSurplus1stSem: number;
  disbursed2ndSem: number;
  returnedSurplus2ndSem: number;
}

export interface MiscFeeConfigDocument {
  id: string; // e.g. "SY_2026-2027"
  schoolYear: string; // e.g. "2026-2027"
  status?: 'ACTIVE' | 'CLOSED';
  isActive?: boolean;
  activeSemester: MiscFeeSemesterTerm;
  headcountSource: MiscFeeHeadcountSource;
  shsEnrolledOverride: number;
  college1stSemEnrolledOverride: number;
  college2ndSemEnrolledOverride: number;
  is1stSemCarriedOver: boolean;
  shsUploadedForSY?: boolean;
  college1stSemUploaded?: boolean;
  college2ndSemUploaded?: boolean;
  closedAt?: any;
  buckets: MiscFeeBucket[];
  updatedAt?: any;
  updatedBy?: string;
}

export interface ComputedBucketBalance {
  bucket: MiscFeeBucket;
  shsEnrolled: number;
  shsGrade12Enrolled: number;
  college1stSemEnrolled: number;
  college2ndSemEnrolled: number;
  shsAnnualPool: number;
  college1stSemPool: number;
  college2ndSemPool: number;
  pool1stSem: number;
  available1stSem: number;
  carryOverFrom1stSem: number;
  pool2ndSem: number;
  available2ndSem: number;
  currentPool: number;
  currentDisbursed: number;
  currentReturnedSurplus: number;
  currentAvailable: number;
}

export interface MiscFeeLedgerEntry {
  id: string;
  schoolYear: string;
  semester: MiscFeeSemesterTerm;
  bucketId: string;
  bucketName: string;
  eventId: string;
  eventTitle?: string;
  liquidationId?: string;
  type: 'disbursement_deduction' | 'disbursement_reversal' | 'liquidation_surplus_return' | 'liquidation_deficit_deduction';
  amount: number;
  chequeNumber?: string;
  performedBy?: string;
  createdAt?: any;
}
