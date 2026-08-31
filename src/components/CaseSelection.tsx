import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Stethoscope, 
  Brain, 
  Sparkles, 
  Zap, 
  CheckCircle2, 
  Search, 
  Tag, 
  FileText, 
  ShieldAlert, 
  HeartHandshake, 
  HelpCircle,
  ChevronRight,
  Flame,
  ArrowLeft,
  Activity,
  UserCheck
} from 'lucide-react';
import { PatientPersona, PATIENT_PERSONAS } from '../lib/gemini';

interface CaseSelectionProps {
  onSelectCase: (patient: PatientPersona, isLearningMode: boolean, isStressTestMode: boolean) => void;
  onBackToHome?: () => void;
  initialSelectedPatientId?: string;
  activeTabType?: 'Simulation' | 'Ward';
}

const renderAvatar = (avatar: string) => {
  if (avatar === '🔫') {
    return (
      <svg viewBox="0 0 64 64" width="1em" height="1em" fill="currentColor" className="inline-block text-gray-800 drop-shadow-md">
        <path d="M56.8,24.1L24,24v-4c0-2.2-1.8-4-4-4H6c-2.2,0-4,1.8-4,4v20c0,2.2,1.8,4,4,4h8.3l3,14.6c0.4,1.8,2,3.4,3.9,3.4h5.6c1.8,0,3.1-1.3,2.8-3.1L26.3,38H56c2.2,0,4-1.8,4-4V28C60,25.8,58.6,24.1,56.8,24.1z M36,34h-8v-6h8V34z M18,34H6V20h12V34z"/>
      </svg>
    );
  }
  return avatar;
};

export const CaseSelection: React.FC<CaseSelectionProps> = ({
  onSelectCase,
  onBackToHome,
  initialSelectedPatientId,
  activeTabType = 'Simulation'
}) => {
  // State for selected patient persona (null if unselected, or pre-selected)
  const [selectedPatient, setSelectedPatient] = useState<PatientPersona | null>(() => {
    if (initialSelectedPatientId) {
      return PATIENT_PERSONAS.find(p => p.id === initialSelectedPatientId) || PATIENT_PERSONAS[0];
    }
    return PATIENT_PERSONAS[0]; // Default selected case for immediate delight, but user can clear or switch
  });

  // State for modes
  const [isLearningMode, setIsLearningMode] = useState<boolean>(true);
  const [isStressTestMode, setIsStressTestMode] = useState<boolean>(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');

  // Extract all unique tags
  const allTags = Array.from(
    new Set(PATIENT_PERSONAS.flatMap(p => p.tags || []))
  );

  // Filter cases based on search and tag
  const filteredCases = PATIENT_PERSONAS.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.chiefComplaint.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.medicalSummary.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTag = selectedTag === 'ALL' || (p.tags && p.tags.includes(selectedTag));

    return matchesSearch && matchesTag;
  });

  return (
    <div className="w-full h-full flex flex-col bg-medical-bg overflow-hidden p-4 sm:p-6 lg:p-8">
      {/* Header Bar */}
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-6 mb-6 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-medical-border/60 pb-5">
          <div className="space-y-1">
            {onBackToHome && (
              <button 
                onClick={onBackToHome}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-medical-primary hover:text-medical-dark uppercase tracking-wider mb-1 transition-colors"
              >
                <ArrowLeft size={14} /> 返回首頁 (Back to Home)
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-medical-soft border border-medical-border flex items-center justify-center text-medical-primary shadow-sm">
                <Stethoscope size={22} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-medical-dark tracking-tight">
                  臨床教案選擇 <span className="text-sm font-sans font-normal text-medical-secondary ml-2">(Case Selection)</span>
                </h1>
                <p className="text-xs sm:text-sm text-medical-secondary">
                  {activeTabType === 'Ward' 
                    ? '請選擇欲進行 IPE 跨專業團隊討論的模擬教案'
                    : '請選擇要演練的高擬真臨床溝通個案，系統將扮演病患與您進行動態對話'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Quick Mode Indicators */}
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-medical-border shadow-sm shrink-0">
            {/* Learning Mode Switch */}
            <label className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded-xl hover:bg-medical-soft/50 transition-colors">
              <span className={`text-xs font-bold ${isLearningMode ? 'text-medical-primary' : 'text-medical-secondary'}`}>
                學習模式
              </span>
              <input 
                type="checkbox"
                checked={isLearningMode}
                onChange={(e) => {
                  setIsLearningMode(e.target.checked);
                  if (e.target.checked) setIsStressTestMode(false);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-medical-primary relative"></div>
            </label>

            <div className="h-4 w-px bg-medical-border"></div>

            {/* Stress Test Mode Switch */}
            <label className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded-xl hover:bg-red-50 transition-colors">
              <span className={`text-xs font-bold ${isStressTestMode ? 'text-red-600' : 'text-medical-secondary'}`}>
                壓力測試
              </span>
              <input 
                type="checkbox"
                checked={isStressTestMode}
                onChange={(e) => {
                  setIsStressTestMode(e.target.checked);
                  if (e.target.checked) setIsLearningMode(false);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500 relative"></div>
            </label>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-end gap-4">
          {/* Search Box */}
          <div className="relative w-full md:w-64 shrink-0">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-medical-secondary" />
            <input 
              type="text"
              placeholder="搜尋教案名稱、主訴..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-medical-border rounded-xl text-xs text-medical-dark placeholder:text-medical-secondary/60 focus:outline-none focus:ring-2 focus:ring-medical-primary/30 focus:border-medical-primary transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-medical-secondary hover:text-medical-dark"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Layout: Split into Left (Focus Area) and Right (Case Grid) */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pb-4 flex-1 min-h-0">
        
        {/* ======================================================== */}
        {/* 左側區塊：已選教案焦點區 (Left Block: 1 / 3 ratio ~ col-span-4 or 5) */}
        {/* ======================================================== */}
        <div className="lg:col-span-5 xl:col-span-4 order-1 lg:order-1 h-full overflow-y-auto pb-8 scrollbar-none">
          <div className="bg-white rounded-[2rem] border-2 border-medical-border/80 p-4 sm:p-6 shadow-lg relative overflow-hidden transition-all">
            
            {/* Top Badge */}
            <div className="flex items-center justify-end mb-4">
              {selectedPatient && (
                <button
                  onClick={() => setSelectedPatient(null)}
                  className="text-[10px] font-bold text-medical-secondary hover:text-medical-accent underline transition-colors"
                >
                  取消選擇 (Clear)
                </button>
              )}
            </div>

            {/* Content Area with AnimatePresence */}
            <AnimatePresence mode="wait">
              {selectedPatient ? (
                <motion.div
                  key={selectedPatient.id}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="flex flex-col gap-4"
                >
                  {/* 視覺呈現：放大顯示的方格 (Enlarged Focal Square) */}
                  <div className="flex flex-row items-center gap-4">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-3xl bg-gradient-to-br from-medical-soft via-white to-medical-soft border-2 border-medical-primary/40 shadow-inner flex items-center justify-center text-4xl sm:text-5xl relative group transition-transform hover:scale-105">
                      <span className="drop-shadow-md">{renderAvatar(selectedPatient.avatar)}</span>
                      <div className="absolute -bottom-2 -right-2 bg-medical-primary text-white p-2 rounded-2xl shadow-md border-2 border-white">
                        <CheckCircle2 size={18} />
                      </div>
                    </div>

                    <div className="space-y-1 text-left flex-1 min-w-0">
                      <h2 className="text-2xl font-bold font-serif text-medical-dark tracking-tight truncate">
                        {selectedPatient.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-medical-secondary bg-medical-soft px-2.5 py-0.5 rounded-md">
                          {selectedPatient.age} 歲
                        </span>
                        {selectedPatient.hasPainMeter && (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Activity size={12} /> 生理/壓力監測
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <hr className="border-medical-border/60" />

                  {/* Chief Complaint & Medical Summary */}
                  <div className="space-y-3 text-left">
                    <div>
                      <h3 className="text-xs font-bold text-medical-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <FileText size={14} /> 臨床個案簡介 / 主訴
                      </h3>
                      <p className="text-xs sm:text-sm text-medical-dark font-medium leading-relaxed bg-medical-soft/40 p-2.5 rounded-2xl border border-medical-border/40">
                        {selectedPatient.chiefComplaint}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-medical-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Brain size={14} /> 醫療背景與客觀數據
                      </h3>
                      <p className="text-xs text-medical-dark/90 leading-relaxed bg-white p-2.5 rounded-2xl border border-medical-border/60 shadow-xs">
                        {selectedPatient.medicalSummary}
                      </p>
                    </div>

                    {/* Tags */}
                    {selectedPatient.tags && selectedPatient.tags.length > 0 && (
                      <div className="pt-1">
                        <div className="flex flex-wrap gap-1.5">
                          {selectedPatient.tags.map((t, idx) => (
                            <span key={idx} className="text-[10px] bg-medical-soft text-medical-primary px-2 py-0.5 rounded-md font-semibold">
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mode Selector Option inside focal panel */}
                  <div className="bg-medical-soft/60 rounded-xl p-2.5 border border-medical-border/60 flex items-center justify-between text-xs">
                    <span className="font-bold text-medical-dark flex items-center gap-1.5">
                      {isStressTestMode ? <Flame size={14} className="text-red-500" /> : <Sparkles size={14} className="text-medical-primary" />}
                      目前模式: {isStressTestMode ? '壓力測試模式' : isLearningMode ? '學習引導模式' : '標準模式'}
                    </span>
                    <span className="text-[10px] text-medical-secondary">
                      {isStressTestMode ? '突發情緒干擾' : isLearningMode ? '包含小提示' : '標準回應'}
                    </span>
                  </div>

                  {/* Dynamic CTA Button (進入個案) */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <button
                      onClick={() => onSelectCase(selectedPatient, isLearningMode, isStressTestMode)}
                      className="w-full py-3 px-4 bg-medical-primary hover:bg-medical-dark active:scale-[0.98] text-white font-bold text-sm sm:text-base rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 flex items-center justify-center gap-3 group cursor-pointer"
                    >
                      <span>進入個案 (Start Simulation)</span>
                      <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </motion.div>
                </motion.div>
              ) : (
                /* Unselected State Placeholder */
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="py-12 px-4 flex flex-col items-center justify-center text-center gap-4 text-medical-secondary"
                >
                  <div className="w-20 h-20 rounded-3xl bg-medical-soft/80 border-2 border-dashed border-medical-border flex items-center justify-center text-medical-primary/50">
                    <HelpCircle size={36} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-medical-dark">
                      請由右側選擇要演練的臨床教案
                    </h3>
                    <p className="text-xs text-medical-secondary max-w-xs mx-auto leading-relaxed">
                      點擊右側列表中的教案卡片，即可載入詳細教案背景、溝通挑戰與開展模擬診間。
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 右側區塊：待選教案列表區 (Right Block: 2 / 3 ratio ~ col-span-7 or 8) */}
        {/* ======================================================== */}
        <div className="lg:col-span-7 xl:col-span-8 order-2 lg:order-2 flex flex-col gap-4 h-full overflow-y-auto pb-8 pr-2 scrollbar-none">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-medical-dark flex items-center gap-2">
              <span>待選教案列表</span>
              <span className="text-xs font-normal text-medical-secondary">
                ({filteredCases.length} 個可用個案)
              </span>
            </h2>
            <span className="text-[11px] text-medical-secondary">
              點擊卡片選擇，即可在左側檢視完整教案細節
            </span>
          </div>

          {filteredCases.length === 0 ? (
            <div className="bg-white rounded-3xl border border-medical-border p-12 text-center text-medical-secondary space-y-2">
              <Search size={32} className="mx-auto text-medical-primary/40 mb-2" />
              <p className="font-bold text-sm text-medical-dark">找不到符合標準的臨床教案</p>
              <p className="text-xs">請嘗試調整搜尋關鍵字或選擇不同的分類標籤</p>
              <button 
                onClick={() => { setSearchQuery(''); setSelectedTag('ALL'); }}
                className="mt-3 text-xs text-medical-primary font-bold underline"
              >
                重置搜尋條件
              </button>
            </div>
          ) : (
            /* Grid layout for case cards */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredCases.map((p) => {
                const isSelected = selectedPatient?.id === p.id;
                
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPatient(p)}
                    className={`group relative p-5 rounded-3xl border-2 transition-all duration-300 text-left flex flex-col justify-between gap-4 cursor-pointer hover:-translate-y-1 hover:shadow-lg ${
                      isSelected
                        ? 'border-medical-primary bg-white shadow-xl ring-2 ring-medical-primary/20 scale-[1.01]'
                        : 'border-transparent bg-white/70 hover:bg-white hover:border-medical-border shadow-sm'
                    }`}
                  >
                    {/* Selected Badge Indicator */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 bg-medical-primary text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <CheckCircle2 size={10} /> 已選取
                      </div>
                    )}

                    {/* Card Header: Avatar & Info */}
                    <div className="flex items-start gap-3.5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 transition-transform group-hover:scale-110 ${
                        isSelected ? 'bg-medical-soft border border-medical-primary/40' : 'bg-medical-bg border border-medical-border'
                      }`}>
                        <span>{renderAvatar(p.avatar)}</span>
                      </div>

                      <div className="min-w-0 pr-4">
                        <h3 className="text-base font-bold text-medical-dark truncate group-hover:text-medical-primary transition-colors">
                          {p.name}
                        </h3>
                        <p className="text-[11px] text-medical-secondary font-medium">
                          {p.age} 歲
                        </p>
                      </div>
                    </div>

                    {/* Chief Complaint snippet */}
                    <div className="text-xs text-medical-dark/90 leading-relaxed space-y-2">
                      <p className="line-clamp-2 font-medium">
                        {p.chiefComplaint}
                      </p>
                    </div>

                    {/* Footer / Tags */}
                    <div className="pt-3 border-t border-medical-border/50 flex flex-wrap items-center justify-between gap-2 mt-auto">
                      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                        {p.tags && p.tags.map((t, idx) => (
                          <span 
                            key={idx}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                              isSelected 
                                ? 'bg-medical-primary/10 text-medical-primary' 
                                : 'bg-medical-soft text-medical-secondary'
                            }`}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.hasPainMeter && (
                          <span className="text-[9px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                            動態指標
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
