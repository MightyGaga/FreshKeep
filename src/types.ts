export type Category = 'vegetables' | 'meat' | 'fruit' | 'seafood' | 'seasoning' | 'drinks' | 'prepared' | 'other';
export type StorageZone = 'cold' | 'frozen' | 'room' | 'cupboard';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodItem {
  id?: string;
  name: string;
  category: Category;
  storageZone: StorageZone;
  expiryDate: string;
  quantity?: number;
  unit?: string;
  userId: string;
  createdAt: string;
}

export interface MealLog {
  id?: string;
  date: string;
  type: MealType;
  items?: string[];
  cost?: number;
  notes?: string;
  userId: string;
  createdAt: string;
}

export const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'vegetables', label: 'Vegetables', icon: '🥬' },
  { value: 'meat', label: 'Meat', icon: '🥩' },
  { value: 'fruit', label: 'Fruit', icon: '🍎' },
  { value: 'seafood', label: 'Seafood', icon: '🐟' },
  { value: 'seasoning', label: 'Seasoning', icon: '🧂' },
  { value: 'drinks', label: 'Drinks', icon: '🥤' },
  { value: 'prepared', label: 'Prepared', icon: '🍱' },
  { value: 'other', label: 'Other', icon: '📦' },
];

export const ZONES: { value: StorageZone; label: string }[] = [
  { value: 'cold', label: 'Cold' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'room', label: 'Room Temp' },
  { value: 'cupboard', label: 'Cupboard' },
];
