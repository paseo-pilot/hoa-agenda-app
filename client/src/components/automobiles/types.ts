export type AutomobileFormValues = {
  license_plate: string;
  make: string;
  model: string;
  color: string;
};

export function emptyAutomobile(): AutomobileFormValues {
  return {
    license_plate: '',
    make: '',
    model: '',
    color: '',
  };
}
