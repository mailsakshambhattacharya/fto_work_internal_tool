export const schoolColumns = [
  ['code', 'School Code', 20, '@'], ['name', 'School Name', 35], ['city', 'City', 23], ['principal_name', 'Principal Name', 30],
  ['principal_email', 'Principal Email', 39], ['principal_phone', 'Principal Phone', 23, '@'],
  ['area', 'Area', 25], ['onboarded_on', 'Onboarded On', 20, 'yyyy-mm-dd'],
  ['coordinator_name', 'Coordinator Name', 28], ['coordinator_phone', 'Coordinator Phone', 23, '@'],
  ['coordinator_email', 'Coordinator Email', 36], ['state', 'State', 20], ['pincode', 'Pincode', 14, '@']
];
export const studentColumns = [
  ['school_code', 'School Code', 20, '@'], ['student_code', 'Student ID', 20, '@'], ['name', 'Student Name', 33],
  ['grade', 'Grade', 18, '@'], ['section', 'Section', 17, '@'], ['status', 'Status', 22],
  ['first_name', 'First Name', 24], ['last_name', 'Last Name', 24], ['email', 'Email', 34], ['test_attempt_code', 'Test Attempt Code', 22, '@']
];
export const requiredHeaders = {
  Schools: ['School Code', 'School Name', 'Principal Name'],
  Students: ['Student ID', 'Student Name', 'Grade']
};

// Columns of the raw student_data exports downloaded from the test website.
export const rawStudentHeaders = ['student_id', 'first_name', 'last_name', 'grade', 'email', 'test_attempt_code'];

// The consolidated FTO sheet, in the exact column order and spelling of the team's master sheet.
export const ftoColumns = [
  ['date', 'DATE', 11], ['school_name', 'School Name', 36], ['student_code', 'student_id', 12, '@'],
  ['first_name', 'first_name', 22], ['last_name', 'last_name', 22], ['grade', 'grade', 8, '@'], ['email', 'email', 34],
  ['test_attempt_code', 'test_attempt_code', 18, '@'], ['gap', '', 4], ['principal_name', 'Principal Name', 26],
  ['principal_email', 'P EMail', 32], ['principal_phone', 'Contact Number', 16, '@'], ['coordinator_name', 'Coordinator Name', 24],
  ['coordinator_phone', 'Coordinator COntact Number', 18, '@'], ['coordinator_email', 'Coordinator Email', 32],
  ['state', 'State', 16], ['pincode', 'Pincode', 10, '@']
];
