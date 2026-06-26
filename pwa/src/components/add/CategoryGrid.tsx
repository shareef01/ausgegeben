import { Category } from '../../db/models';
import { AppIcon } from '../common/AppIcon';
import { clsx } from 'clsx';

interface CategoryGridProps {
  categories: Category[];
  selectedId?: number;
  onSelect: (category: Category) => void;
  accentColor: string;
}

export const CategoryGrid = ({ categories, selectedId, onSelect, accentColor }: CategoryGridProps) => {
  return (
    <div className="grid grid-cols-4 gap-y-6 p-md">
      {categories.map((category) => {
        const isSelected = selectedId === category.id;
        const colorHex = `#${(category.colorInt & 0xFFFFFF).toString(16).padStart(6, '0')}`;

        return (
          <button
            key={category.id}
            onClick={() => onSelect(category)}
            className="flex flex-col items-center gap-2"
          >
            <div
              className={clsx(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                isSelected ? "scale-110" : "scale-100"
              )}
              style={{
                backgroundColor: isSelected ? colorHex : `${colorHex}1A`,
                color: isSelected ? '#ffffff' : colorHex
              }}
            >
              <AppIcon name={category.iconName} size={22} />
            </div>
            <span className={clsx(
              "text-xs font-medium truncate w-full text-center px-1",
              isSelected ? "text-on-background" : "text-on-surface-variant"
            )}>
              {category.name}
            </span>
          </button>
        );
      })}
    </div>
  );
};
