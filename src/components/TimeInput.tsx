import PickerInput, { type PickerInputProps } from './PickerInput';

export default function TimeInput(props: Omit<PickerInputProps, 'kind'>) {
  return <PickerInput {...props} kind="time" />;
}
