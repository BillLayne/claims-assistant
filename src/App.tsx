import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, FileText, ListPlus, CheckCircle, ArrowRight, ArrowLeft, Download, Plus, Trash2, Loader2, Info, AlertCircle, Camera, FileSpreadsheet, Image as ImageIcon } from 'lucide-react';
import { estimateItemValue, analyzeImage, estimateMultipleItemsValues } from './services/geminiService';
import { generatePDF } from './services/pdfService';
import { exportToCSV } from './services/csvService';
import { ClaimInfo, ClaimItem } from './types';

const STEPS = [
  { id: 1, title: 'Claim Details', icon: FileText },
  { id: 2, title: 'Add Items', icon: ListPlus },
  { id: 3, title: 'Review & Export', icon: CheckCircle },
];

const ROOMS = ['Living Room', 'Kitchen', 'Primary Bedroom', 'Bedroom', 'Bathroom', 'Garage', 'Outbuilding', 'Other'];

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [claimInfo, setClaimInfo] = useState<ClaimInfo>({
    customerName: '',
    dateOfLoss: '',
    claimNumber: '',
    insuranceCompany: '',
    adjusterName: '',
    policyNumber: '',
    typeOfLoss: 'Fire',
  });
  const [items, setItems] = useState<ClaimItem[]>([]);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemBrand, setNewItemBrand] = useState('');
  const [newItemModel, setNewItemModel] = useState('');
  const [newItemAge, setNewItemAge] = useState('');
  const [newItemCondition, setNewItemCondition] = useState('Good');
  const [newItemImage, setNewItemImage] = useState<{data: string, mimeType: string} | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(ROOMS[0]);
  const [customRoom, setCustomRoom] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from local storage on mount
  useEffect(() => {
    const savedItems = localStorage.getItem('claimItems');
    const savedInfo = localStorage.getItem('claimInfo');
    if (savedItems) {
      try { setItems(JSON.parse(savedItems)); } catch (e) { console.error(e); }
    }
    if (savedInfo) {
      try { setClaimInfo(JSON.parse(savedInfo)); } catch (e) { console.error(e); }
    }
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('claimItems', JSON.stringify(items));
    localStorage.setItem('claimInfo', JSON.stringify(claimInfo));
  }, [items, claimInfo]);

  const handleNext = () => setCurrentStep((prev) => Math.min(prev + 1, 3));
  const handleBack = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDesc || !newItemAge) return;

    const age = parseFloat(newItemAge);
    if (isNaN(age) || age < 0) return;

    const finalRoom = selectedRoom === 'Other' ? customRoom || 'Other' : selectedRoom;

    const newItem: ClaimItem = {
      id: Math.random().toString(36).substring(7),
      room: finalRoom,
      description: newItemDesc,
      brand: newItemBrand,
      model: newItemModel,
      condition: newItemCondition,
      ageYears: age,
      status: 'pending',
      image: newItemImage || undefined
    };

    setItems((prev) => [newItem, ...prev]);
    setNewItemDesc('');
    setNewItemBrand('');
    setNewItemModel('');
    setNewItemAge('');
    setNewItemCondition('Good');
    setNewItemImage(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      const mimeType = file.type;
      setNewItemImage({ data: base64Data, mimeType });

      try {
        const details = await analyzeImage(base64Data, mimeType);
        if (details.description) setNewItemDesc(details.description);
        if (details.brand) setNewItemBrand(details.brand);
        if (details.model) setNewItemModel(details.model);
        if (details.ageYears !== undefined) setNewItemAge(details.ageYears.toString());
        if (details.condition) setNewItemCondition(details.condition);
      } catch (error) {
        console.error("Failed to analyze image", error);
      } finally {
        setIsAnalyzingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCalculateAll = async () => {
    const pendingItems = items.filter(i => i.status === 'pending' || i.status === 'error');
    if (pendingItems.length === 0) {
      handleNext();
      return;
    }

    setIsCalculating(true);
    
    // Mark all pending items as loading
    setItems(prev => prev.map(i => pendingItems.some(p => p.id === i.id) ? { ...i, status: 'loading' } : i));

    // Process in chunks of 5 to avoid payload limits (especially with images) and ensure reliability
    const chunkSize = 5;
    for (let i = 0; i < pendingItems.length; i += chunkSize) {
      const chunk = pendingItems.slice(i, i + chunkSize);
      try {
        const results = await estimateMultipleItemsValues(chunk);
        
        setItems(prev => prev.map(item => {
          const result = results.find((r: any) => r.id === item.id);
          if (result) {
            return { ...item, status: 'complete', ...result };
          }
          return item;
        }));
      } catch (error) {
        // Mark chunk as error
        setItems(prev => prev.map(item => {
          if (chunk.some(c => c.id === item.id)) {
            return { ...item, status: 'error' };
          }
          return item;
        }));
      }
    }
    
    setIsCalculating(false);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totalRC = items.reduce((sum, item) => sum + (item.currentPrice || 0), 0);
  const totalACV = items.reduce((sum, item) => sum + (item.acv || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-28">
      {/* Header */}
      <header className="bg-indigo-600 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-indigo-200" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Bill Layne Insurance</h1>
              <p className="text-indigo-200 text-sm font-medium">Claims Assistant</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full -z-10"></div>
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-600 rounded-full -z-10 transition-all duration-500 ease-in-out"
              style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
            ></div>
            
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep >= step.id;
              return (
                <div key={step.id} className="flex flex-col items-center gap-2 bg-slate-50 px-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-400 border-2 border-slate-200'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isActive ? 'text-indigo-700' : 'text-slate-400'}`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 md:p-8"
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Claim Information</h2>
                  <p className="text-slate-500 mt-1">Let's start with the basic details of your claim.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Your Full Name</label>
                    <input type="text" value={claimInfo.customerName} onChange={e => setClaimInfo({...claimInfo, customerName: e.target.value})} className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date of Loss</label>
                    <input type="date" value={claimInfo.dateOfLoss} onChange={e => setClaimInfo({...claimInfo, dateOfLoss: e.target.value})} className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Type of Loss</label>
                    <select value={claimInfo.typeOfLoss} onChange={e => setClaimInfo({...claimInfo, typeOfLoss: e.target.value})} className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white">
                      <option>Fire</option>
                      <option>Theft</option>
                      <option>Lightning</option>
                      <option>Water Damage</option>
                      <option>Wind / Hail</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Claim Number</label>
                    <input type="text" value={claimInfo.claimNumber} onChange={e => setClaimInfo({...claimInfo, claimNumber: e.target.value})} className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" placeholder="e.g. CL-123456" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Insurance Company</label>
                    <input type="text" value={claimInfo.insuranceCompany} onChange={e => setClaimInfo({...claimInfo, insuranceCompany: e.target.value})} className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" placeholder="e.g. State Farm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Policy Number</label>
                    <input type="text" value={claimInfo.policyNumber} onChange={e => setClaimInfo({...claimInfo, policyNumber: e.target.value})} className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" placeholder="e.g. POL-987654" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Adjuster Name (if known)</label>
                    <input type="text" value={claimInfo.adjusterName} onChange={e => setClaimInfo({...claimInfo, adjusterName: e.target.value})} className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" placeholder="Jane Smith" />
                  </div>
                </div>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 md:p-8 bg-slate-50/50"
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Lost or Damaged Items</h2>
                  <p className="text-slate-500 mt-1">Add items to your inventory. Our AI will help estimate their current value.</p>
                </div>

                {/* Add Item Form */}
                <form onSubmit={handleAddItem} className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
                  
                  {/* Prominent Camera Button for Mobile */}
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 mb-6 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold flex items-center justify-center gap-3 transition-colors active:scale-[0.98] shadow-sm"
                  >
                    {isAnalyzingImage ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
                    <span className="text-lg">{isAnalyzingImage ? 'Analyzing Image...' : 'Tap to Auto-fill from Photo'}</span>
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  <div className="mb-5">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Room / Area</label>
                    <div className="flex overflow-x-auto md:flex-wrap gap-2 pb-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 w-full">
                      {ROOMS.map(room => (
                        <button
                          key={room}
                          type="button"
                          onClick={() => setSelectedRoom(room)}
                          className={`whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${selectedRoom === room ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          {room}
                        </button>
                      ))}
                    </div>
                    {selectedRoom === 'Other' && (
                      <input
                        type="text"
                        value={customRoom}
                        onChange={e => setCustomRoom(e.target.value)}
                        placeholder="Enter area name (e.g., Shed)"
                        className="mt-3 w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        required
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Item Type / Description *</label>
                      <input 
                        type="text" 
                        required
                        value={newItemDesc} 
                        onChange={e => setNewItemDesc(e.target.value)} 
                        className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" 
                        placeholder="e.g. Television, Sofa, Laptop" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Brand (Optional)</label>
                      <input 
                        type="text" 
                        value={newItemBrand} 
                        onChange={e => setNewItemBrand(e.target.value)} 
                        className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" 
                        placeholder="e.g. Samsung" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Model (Optional)</label>
                      <input 
                        type="text" 
                        value={newItemModel} 
                        onChange={e => setNewItemModel(e.target.value)} 
                        className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" 
                        placeholder="e.g. QLED 4K" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Age (Years) *</label>
                        <input 
                          type="number" 
                          required
                          min="0"
                          step="0.5"
                          value={newItemAge} 
                          onChange={e => setNewItemAge(e.target.value)} 
                          className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white" 
                          placeholder="e.g. 3" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Condition *</label>
                        <select 
                          value={newItemCondition} 
                          onChange={e => setNewItemCondition(e.target.value)} 
                          className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                        >
                          <option value="Excellent">Excellent</option>
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                          <option value="Poor">Poor</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    {newItemImage ? (
                      <div className="flex items-center justify-between w-full md:w-auto gap-2 text-emerald-700 text-sm font-medium bg-emerald-50 px-4 py-3 rounded-xl border border-emerald-200">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-5 h-5" />
                          Image Attached
                        </div>
                        <button type="button" onClick={() => setNewItemImage(null)} className="p-1 text-emerald-700 hover:text-emerald-900 bg-emerald-100 rounded-full">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="hidden md:block"></div>
                    )}
                    <button type="submit" className="w-full md:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md active:scale-[0.98]">
                      <Plus className="w-6 h-6" />
                      <span>Add Item</span>
                    </button>
                  </div>
                </form>

                {/* Items List */}
                <div className="space-y-4">
                  {items.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                      <ListPlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No items added yet.</p>
                      <p className="text-slate-400 text-sm mt-1">Start by adding your first item above.</p>
                    </div>
                  ) : (
                    items.map((item) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={item.id} 
                        className="relative bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 md:items-center justify-between"
                      >
                        <button onClick={() => removeItem(item.id)} className="absolute top-3 right-3 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 bg-slate-50 md:bg-transparent rounded-full transition-colors z-10">
                          <Trash2 className="w-5 h-5" />
                        </button>

                        <div className="flex-1 pr-10 md:pr-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-md">{item.room}</span>
                            {item.image && <ImageIcon className="w-4 h-4 text-slate-400" />}
                          </div>
                          <h3 className="font-bold text-slate-900 text-lg leading-tight mb-1">
                            {[item.brand, item.model, item.description].filter(Boolean).join(' ')}
                          </h3>
                          <p className="text-slate-500 text-sm font-medium">{item.ageYears} years old • {item.condition} condition</p>
                          
                          {item.status === 'complete' && item.explanation && (
                            <div className="mt-3 flex items-start gap-2 bg-indigo-50 text-indigo-800 p-3 rounded-xl text-sm leading-relaxed">
                              <Info className="w-5 h-5 mt-0.5 shrink-0 text-indigo-500" />
                              <p>{item.explanation}</p>
                            </div>
                          )}
                          {item.status === 'error' && (
                            <div className="mt-3 flex items-start gap-2 bg-red-50 text-red-800 p-3 rounded-xl text-sm">
                              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-500" />
                              <p>Failed to estimate value. Please try again or enter manually later.</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-6 md:w-64 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 mt-2 md:mt-0">
                          {item.status === 'loading' ? (
                            <div className="flex items-center gap-2 text-slate-500 w-full justify-center md:justify-end py-2">
                              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                              <span className="text-sm font-medium">Estimating...</span>
                            </div>
                          ) : item.status === 'pending' ? (
                            <div className="text-slate-400 text-sm font-medium w-full text-center md:text-right py-2">Pending Calculation</div>
                          ) : item.status === 'complete' ? (
                            <div className="text-right w-full">
                              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-0.5">Est. ACV</div>
                              <div className="text-3xl font-black text-emerald-600">${item.acv?.toFixed(2)}</div>
                              <div className="text-sm text-slate-400 font-medium line-through">New: ${item.currentPrice?.toFixed(2)}</div>
                            </div>
                          ) : (
                            <div className="text-slate-400 text-sm font-medium w-full text-center md:text-right py-2">Estimation failed</div>
                          )}
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 md:p-8"
              >
                <div className="mb-8 text-center">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Ready for the Adjuster</h2>
                  <p className="text-slate-500 mt-2 max-w-md mx-auto">Your inventory is complete. You can now download the PDF report to share with your insurance adjuster.</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mb-8">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Claim Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Total Items</p>
                      <p className="font-semibold text-slate-900">{items.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Type of Loss</p>
                      <p className="font-semibold text-slate-900">{claimInfo.typeOfLoss}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Est. Replacement Cost</p>
                      <p className="font-semibold text-slate-900">${totalRC.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Est. Actual Cash Value</p>
                      <p className="font-bold text-emerald-600 text-lg">${totalACV.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2 text-amber-800 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p><strong>Disclaimer:</strong> All Replacement Costs and Actual Cash Value (ACV) amounts are AI-generated estimates based on current market data and are not guaranteed. Final valuations are subject to adjuster review.</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <button 
                    onClick={() => generatePDF(claimInfo, items)}
                    className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-3 text-lg active:scale-[0.98]"
                  >
                    <Download className="w-6 h-6" />
                    Download PDF
                  </button>
                  <button 
                    onClick={() => exportToCSV(claimInfo, items)}
                    className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-3 text-lg active:scale-[0.98]"
                  >
                    <FileSpreadsheet className="w-6 h-6" />
                    Export CSV
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Footer */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 pb-6 md:pb-4 z-50 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <button
              onClick={handleBack}
              disabled={currentStep === 1 || isCalculating}
              className={`flex-1 max-w-[100px] md:max-w-[140px] py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${currentStep === 1 || isCalculating ? 'text-slate-300 bg-slate-50 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-200 bg-slate-100 active:bg-slate-200'}`}
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            
            {currentStep === 1 && (
              <button
                onClick={handleNext}
                className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors shadow-md active:scale-[0.98]"
              >
                Next Step
                <ArrowRight className="w-5 h-5" />
              </button>
            )}

            {currentStep === 2 && (
              <button
                onClick={items.some(i => i.status === 'pending' || i.status === 'error') ? handleCalculateAll : handleNext}
                disabled={isCalculating || items.length === 0}
                className={`flex-1 py-3.5 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors shadow-md active:scale-[0.98] ${isCalculating || items.length === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}
              >
                {isCalculating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="hidden sm:inline">Calculating...</span>
                    <span className="sm:hidden">Wait...</span>
                  </>
                ) : items.some(i => i.status === 'pending' || i.status === 'error') ? (
                  <>
                    Calculate <span className="hidden sm:inline">Estimates</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    Review <span className="hidden sm:inline">& Export</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
