import PickerInput, { type PickerInputProps } from './PickerInput';

export default function DateInput(props: Omit<PickerInputProps, 'kind'>) {
  return <PickerInput {...props} kind="date" />;
}
