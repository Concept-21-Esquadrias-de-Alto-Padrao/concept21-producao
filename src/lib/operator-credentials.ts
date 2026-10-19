export const operatorRegistrationLength = 3;
export const operatorPinLength = 4;

const onlyDigitsRegex = /\D/g;
const registrationRegex = /^\d{3}$/;
const pinRegex = /^\d{4}$/;

function digitsOnly(value: string) {
  return value.replace(onlyDigitsRegex, "");
}

export function normalizeOperatorRegistration(value: string) {
  return digitsOnly(value).slice(0, operatorRegistrationLength);
}

export function normalizeOperatorPin(value: string) {
  return digitsOnly(value).slice(0, operatorPinLength);
}

export function isValidOperatorRegistration(value: string) {
  return registrationRegex.test(value);
}

export function isValidOperatorPin(value: string) {
  return pinRegex.test(value);
}
