import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface IosSegmentedControlProps {
  options: string[];
  selectedIndex: number;
  onSelected: (index: number) => void;
  className?: string;
}

export const IosSegmentedControl = ({
  options,
  selectedIndex,
  onSelected,
  className,
}: IosSegmentedControlProps) => {
  return (
    <div className={clsx(
      'relative flex bg-surface p-1 rounded-xl w-full',
      className
    )}>
      {/* Background slider */}
      <motion.div
        className="absolute bg-background shadow-sm rounded-lg"
        initial={false}
        animate={{
          x: `${selectedIndex * 100}%`,
          width: `${100 / options.length}%`,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          top: '4px',
          bottom: '4px',
          left: '4px',
          width: `calc(${100 / options.length}% - 8px)`,
        }}
      />

      {options.map((option, index) => (
        <button
          key={option}
          onClick={() => onSelected(index)}
          className={clsx(
            'relative z-10 flex-1 py-1.5 text-sm font-medium transition-colors duration-200',
            selectedIndex === index ? 'text-on-background' : 'text-on-surface-variant'
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
};
