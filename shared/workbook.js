export const schoolColumns = [
  ['code', 'School Code', 20, '@'], ['name', 'School Name', 35], ['city', 'City', 23], ['principal_name', 'Principal Name', 30],
  ['principal_email', 'Principal Email', 39], ['principal_phone', 'Principal Phone', 23, '@']
];
export const studentColumns = [
  ['school_code', 'School Code', 20, '@'], ['student_code', 'Student ID', 20, '@'], ['name', 'Student Name', 33],
  ['grade', 'Grade', 18, '@'], ['section', 'Section', 17, '@'], ['status', 'Status', 22]
];
export const requiredHeaders = {
  Schools: ['School Code', 'School Name', 'Principal Name'],
  Students: ['School Code', 'Student ID', 'Student Name', 'Grade']
};
