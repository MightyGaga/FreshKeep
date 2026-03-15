import { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode, FormEvent } from 'react';
import { 
  Plus, 
  Calendar, 
  Refrigerator, 
  Settings as SettingsIcon, 
  ChevronRight, 
  ChevronLeft,
  Trash2,
  AlertCircle,
  Clock,
  DollarSign,
  Search,
  Filter,
  CheckCircle2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { format, addDays, differenceInDays, isPast, startOfDay, parseISO, isSameDay } from 'date-fns';
import { db, OperationType, handleFirestoreError } from './firebase';
import { FoodItem, MealLog, CATEGORIES, ZONES, Category, StorageZone, MealType } from './types';

// --- Error Boundary ---

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'Something went wrong.';
      try {
        const parsed = JSON.parse(this.state.error?.message || '{}');
        if (parsed.error) {
          errorMessage = `Permission Error: ${parsed.error}. Please check your access rights.`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold mb-2">Application Error</h2>
            <p className="text-zinc-500 mb-8">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = '',
  disabled = false
}: { 
  children: ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; 
  className?: string;
  disabled?: boolean;
}) => {
  const variants = {
    primary: 'bg-black text-white hover:bg-zinc-800',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    ghost: 'bg-transparent text-zinc-500 hover:bg-zinc-100'
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void; key?: any }) => (
  <div 
    onClick={onClick}
    className={`bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''} ${className}`}
  >
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <h3 className="text-xl font-semibold">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// --- Main App ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [loading, setLoading] = useState(false); // No auth to wait for
  const [activeTab, setActiveTab] = useState<'fridge' | 'journal' | 'settings'>('fridge');
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState<StorageZone | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');

  // Modals
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isAddLogOpen, setIsAddLogOpen] = useState(false);

  const publicUserId = 'public-user';

  // Test connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const foodQuery = query(collection(db, 'foodItems'), where('userId', '==', publicUserId), orderBy('expiryDate', 'asc'));
    const unsubscribeFood = onSnapshot(foodQuery, (snapshot) => {
      setFoodItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'foodItems'));

    const logsQuery = query(collection(db, 'mealLogs'), where('userId', '==', publicUserId), orderBy('date', 'desc'));
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      setMealLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MealLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'mealLogs'));

    return () => {
      unsubscribeFood();
      unsubscribeLogs();
    };
  }, []);

  const filteredItems = useMemo(() => {
    return foodItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesZone = selectedZone === 'all' || item.storageZone === selectedZone;
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      return matchesSearch && matchesZone && matchesCategory;
    });
  }, [foodItems, searchQuery, selectedZone, selectedCategory]);

  const getExpiryStatus = (dateStr: string) => {
    const days = differenceInDays(parseISO(dateStr), startOfDay(new Date()));
    if (days < 0) return { label: 'Expired', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' };
    if (days <= 3) return { label: `Expires in ${days}d`, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' };
    return { label: `Expires in ${days}d`, color: 'text-zinc-500', bg: 'bg-zinc-50', border: 'border-zinc-100' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-4"
        >
          <Refrigerator size={48} className="text-zinc-900" />
          <p className="text-zinc-500 font-medium">Opening FreshKeep...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-24">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-zinc-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <Refrigerator size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">FreshKeep</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsAddItemOpen(true)}
            className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center hover:bg-zinc-200 transition-colors"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {activeTab === 'fridge' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-col gap-6">
              {/* Search & Filters */}
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search your fridge..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all shadow-sm"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  <button 
                    onClick={() => setSelectedZone('all')}
                    className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all ${selectedZone === 'all' ? 'bg-black text-white' : 'bg-white text-zinc-500 border border-zinc-100'}`}
                  >
                    All Zones
                  </button>
                  {ZONES.map(zone => (
                    <button 
                      key={zone.value}
                      onClick={() => setSelectedZone(zone.value)}
                      className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all ${selectedZone === zone.value ? 'bg-black text-white' : 'bg-white text-zinc-500 border border-zinc-100'}`}
                    >
                      {zone.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredItems.map(item => {
                  const status = getExpiryStatus(item.expiryDate);
                  const category = CATEGORIES.find(c => c.value === item.category);
                  
                  return (
                    <Card key={item.id} className={`group relative overflow-hidden border-l-4 ${status.border.replace('border-', 'border-l-')}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{category?.icon}</span>
                          <div>
                            <h3 className="font-semibold text-zinc-900">{item.name}</h3>
                            <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">{item.storageZone}</p>
                          </div>
                        </div>
                        <button 
                          onClick={async () => {
                            if (confirm('Delete this item?')) {
                              try {
                                await deleteDoc(doc(db, 'foodItems', item.id!));
                              } catch (err) {
                                handleFirestoreError(err, OperationType.DELETE, `foodItems/${item.id}`);
                              }
                            }
                          }}
                          className="p-2 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between mt-auto">
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${status.bg} ${status.color}`}>
                          <Clock size={12} />
                          {status.label}
                        </div>
                        {item.quantity && (
                          <div className="text-sm font-medium text-zinc-500">
                            {item.quantity}{item.unit}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
                {filteredItems.length === 0 && (
                  <div className="col-span-full py-20 text-center">
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Refrigerator className="text-zinc-300" size={32} />
                    </div>
                    <p className="text-zinc-500 font-medium">Your fridge is empty</p>
                    <p className="text-zinc-400 text-sm">Time to go shopping!</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'journal' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Meal Journal</h2>
                <Button onClick={() => setIsAddLogOpen(true)} variant="secondary" className="rounded-full">
                  <Plus size={18} /> Log Meal
                </Button>
              </div>

              <div className="space-y-6">
                {mealLogs.length === 0 ? (
                  <div className="py-20 text-center">
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar className="text-zinc-300" size={32} />
                    </div>
                    <p className="text-zinc-500 font-medium">No meals logged yet</p>
                    <p className="text-zinc-400 text-sm">Start tracking your culinary journey!</p>
                  </div>
                ) : (
                  mealLogs.map(log => (
                    <div key={log.id} className="relative pl-8 border-l border-zinc-200 pb-8 last:pb-0">
                      <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-zinc-300" />
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
                            {format(parseISO(log.date), 'MMM dd, yyyy')}
                          </span>
                          {log.cost && (
                            <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
                              <DollarSign size={14} /> {log.cost.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <Card className="hover:shadow-none">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg capitalize">{log.type}</h3>
                            <button 
                              onClick={async () => {
                                if (confirm('Delete this log?')) {
                                  try {
                                    await deleteDoc(doc(db, 'mealLogs', log.id!));
                                  } catch (err) {
                                    handleFirestoreError(err, OperationType.DELETE, `mealLogs/${log.id}`);
                                  }
                                }
                              }}
                              className="text-zinc-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          {log.notes && <p className="text-zinc-600 text-sm mb-3 italic">"{log.notes}"</p>}
                          {log.items && log.items.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {log.items.map((item, i) => (
                                <span key={i} className="px-2 py-1 bg-zinc-100 text-zinc-600 text-xs rounded-lg font-medium">
                                  {item}
                                </span>
                              ))}
                            </div>
                          )}
                        </Card>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-col gap-8">
              <h2 className="text-2xl font-bold">Settings</h2>
              
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">App Info</h3>
                <Card>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-600">Version</span>
                      <span className="font-medium">1.0.0 (MVP)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-600">Storage Used</span>
                      <span className="font-medium">{foodItems.length} Items</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-zinc-100 px-6 py-4 flex justify-around items-center z-40">
        <button 
          onClick={() => setActiveTab('fridge')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'fridge' ? 'text-black scale-110' : 'text-zinc-400'}`}
        >
          <Refrigerator size={24} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Fridge</span>
        </button>
        <button 
          onClick={() => setActiveTab('journal')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'journal' ? 'text-black scale-110' : 'text-zinc-400'}`}
        >
          <Calendar size={24} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Journal</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-black scale-110' : 'text-zinc-400'}`}
        >
          <SettingsIcon size={24} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Settings</span>
        </button>
      </nav>

      {/* Modals */}
      <AddItemModal 
        isOpen={isAddItemOpen} 
        onClose={() => setIsAddItemOpen(false)} 
        userId={publicUserId} 
      />
      <AddLogModal 
        isOpen={isAddLogOpen} 
        onClose={() => setIsAddLogOpen(false)} 
        userId={publicUserId}
        availableItems={foodItems.map(i => i.name)}
      />
    </div>
  );
}

function AddItemModal({ isOpen, onClose, userId }: { isOpen: boolean; onClose: () => void; userId: string }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('vegetables');
  const [zone, setZone] = useState<StorageZone>('cold');
  const [expiry, setExpiry] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newItem: FoodItem = {
        name,
        category,
        storageZone: zone,
        expiryDate: new Date(expiry).toISOString(),
        quantity: quantity ? parseFloat(quantity) : undefined,
        unit,
        userId,
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'foodItems'), newItem);
      onClose();
      // Reset
      setName('');
      setCategory('vegetables');
      setZone('cold');
      setExpiry(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
      setQuantity('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'foodItems');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add to Fridge">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Item Name</label>
          <input 
            required
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Organic Eggs"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Category</label>
            <select 
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none"
            >
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Zone</label>
            <select 
              value={zone}
              onChange={(e) => setZone(e.target.value as StorageZone)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none"
            >
              {ZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Expiry Date</label>
          <input 
            required
            type="date" 
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Quantity</label>
            <input 
              type="number" 
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Unit</label>
            <input 
              type="text" 
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs"
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <Button disabled={submitting} className="w-full py-4 rounded-2xl">
          {submitting ? 'Adding...' : 'Save Item'}
        </Button>
      </form>
    </Modal>
  );
}

function AddLogModal({ isOpen, onClose, userId, availableItems }: { isOpen: boolean; onClose: () => void; userId: string; availableItems: string[] }) {
  const [type, setType] = useState<MealType>('breakfast');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newLog: MealLog = {
        date: new Date(date).toISOString(),
        type,
        items: selectedItems,
        cost: cost ? parseFloat(cost) : undefined,
        notes,
        userId,
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'mealLogs'), newLog);
      onClose();
      // Reset
      setType('breakfast');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setCost('');
      setNotes('');
      setSelectedItems([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'mealLogs');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleItem = (item: string) => {
    setSelectedItems(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log a Meal">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Type</label>
            <select 
              value={type}
              onChange={(e) => setType(e.target.value as MealType)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Date</label>
            <input 
              required
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Ingredients Used</label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-zinc-50 rounded-xl border border-zinc-100">
            {availableItems.length === 0 ? (
              <p className="text-zinc-400 text-xs italic">No items in fridge to select</p>
            ) : (
              availableItems.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleItem(item)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedItems.includes(item) ? 'bg-black text-white' : 'bg-white text-zinc-500 border border-zinc-100'}`}
                >
                  {item}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Estimated Cost ($)</label>
          <input 
            type="number" 
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Notes / Recipe</label>
          <textarea 
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How was it?"
            rows={3}
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none resize-none"
          />
        </div>

        <Button disabled={submitting} className="w-full py-4 rounded-2xl">
          {submitting ? 'Logging...' : 'Save Meal'}
        </Button>
      </form>
    </Modal>
  );
}
