import { AppIcon } from '../common/AppIcon';

interface NumericKeypadProps {
  onPress: (key: string) => void;
  onBackspace: () => void;
}

export const NumericKeypad = ({ onPress, onBackspace }: NumericKeypadProps) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];

  return (
    <div className="grid grid-cols-3 gap-px bg-divider border-t border-divider">
      {keys.map((key) => (
        <button
          key={key}
          onClick={() => key === 'back' ? onBackspace() : onPress(key)}
          className="bg-background h-16 text-2xl font-medium active:bg-surface flex items-center justify-center"
        >
          {key === 'back' ? <AppIcon name="backspace" size={24} /> : key}
        </button>
      ))}
    </div>
  );
};
