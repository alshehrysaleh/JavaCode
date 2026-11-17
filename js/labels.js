// تسميات عربية لقيم قاعدة البيانات
export const MUSCLE_AR = {
  chest: 'الصدر',
  shoulders: 'الأكتاف',
  biceps: 'الباي (البايسبس)',
  triceps: 'التراي (الترايسبس)',
  forearms: 'الساعد',
  abdominals: 'البطن',
  quadriceps: 'الفخذ الأمامي',
  hamstrings: 'الفخذ الخلفي',
  adductors: 'الفخذ الداخلي',
  abductors: 'الورك الخارجي',
  glutes: 'المؤخرة (الألوية)',
  calves: 'السمانة',
  lats: 'الظهر العريض (اللاتس)',
  'middle back': 'منتصف الظهر',
  'lower back': 'أسفل الظهر',
  traps: 'الترابيس',
  neck: 'الرقبة',
};

export const EQUIPMENT_AR = {
  barbell: 'بار حديد',
  dumbbell: 'دمبل',
  machine: 'جهاز',
  cable: 'كيبل',
  'body only': 'وزن الجسم',
  kettlebells: 'كيتل بل',
  bands: 'أشرطة مقاومة',
  'medicine ball': 'كرة طبية',
  'exercise ball': 'كرة تمارين',
  'e-z curl bar': 'بار EZ',
  'foam roll': 'رول إسفنجي',
  other: 'أخرى',
};

export const LEVEL_AR = { beginner: 'مبتدئ', intermediate: 'متوسط', expert: 'متقدم' };

export const CATEGORY_AR = {
  strength: 'قوة',
  stretching: 'إطالة',
  plyometrics: 'بلايومترك',
  strongman: 'سترونغ مان',
  powerlifting: 'باورلفتنغ',
  cardio: 'كارديو',
  'olympic weightlifting': 'رفع أولمبي',
};

export const mAr = (m) => MUSCLE_AR[m] || m;
export const eqAr = (e) => EQUIPMENT_AR[e] || e;
