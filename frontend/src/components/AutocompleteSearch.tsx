import React, { useState, useEffect, useRef } from 'react';

interface AutocompleteSearchProps {
  localStocks?: any[];
  onSelect: (ticker: string) => void;
  placeholder?: string;
}

export default function AutocompleteSearch({ localStocks = [], onSelect, placeholder = "종목명/티커 검색" }: AutocompleteSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }

    const fetchSuggestions = async () => {
      let q = query.toLowerCase().trim();
      
      // 오타 보정 (예: 삼서전자 -> 삼성전자)
      if (q === '삼서전자') q = '삼성전자';
      
      // 1. Local matching (allows Korean support if localStocks has it)
      const localMatches = localStocks.filter(s => 
        (s.name && String(s.name).toLowerCase().includes(q)) || 
        (s.symbol && String(s.symbol).toLowerCase().includes(q)) ||
        (s.ticker && String(s.ticker).toLowerCase().includes(q))
      ).map(s => ({
        ticker: s.ticker || s.symbol,
        name: s.name,
        exchange: s.source || 'Local'
      })).slice(0, 5);

      // 2. Global matching
      try {
        setIsSearching(true);
        const res = await fetch(`/api/stock/autocomplete?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(res.statusText || 'API Error');
        const globalMatches = await res.json();
        
        // Merge without duplicates
        const merged = [...localMatches];
        const seen = new Set(localMatches.map(m => m.ticker));
        
        for (const m of globalMatches) {
          if (!seen.has(m.ticker)) {
            seen.add(m.ticker);
            merged.push(m);
          }
        }
        
        setSuggestions(merged.slice(0, 10));
        setSelectedIndex(-1);
        setIsOpen(true);
      } catch (e) {
        setSuggestions(localMatches);
        setSelectedIndex(-1);
        setIsOpen(true);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceId = setTimeout(() => {
      fetchSuggestions();
    }, 200);

    return () => clearTimeout(debounceId);
  }, [query, localStocks]);

  const handleSelect = (ticker: string) => {
    onSelect(ticker);
    setQuery("");
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Enter') handleSubmit(e);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSelect(suggestions[selectedIndex].ticker);
      } else {
        handleSubmit(e);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let q = query.trim();
    if (q === '삼서전자') q = '삼성전자';

    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      handleSelect(suggestions[selectedIndex].ticker);
      return;
    }

    if (q) {
      // If user typed exact name or ticker, resolve to ticker
      const match = suggestions.find(s => 
        String(s.name).toLowerCase() === q.toLowerCase() || 
        String(s.ticker).toLowerCase() === q.toLowerCase()
      ) || localStocks.find(s => 
        (s.name && String(s.name).toLowerCase() === q.toLowerCase()) || 
        (s.ticker && String(s.ticker).toLowerCase() === q.toLowerCase()) ||
        (s.symbol && String(s.symbol).toLowerCase() === q.toLowerCase())
      );
      
      if (match) {
        handleSelect(match.ticker || match.symbol);
      } else {
        handleSelect(q); // Fallback to raw query if no exact match found
      }
    }
  };

  return (
    <div ref={wrapperRef} className="relative flex-1 flex">
      <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
        <input 
          type="text" 
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-black border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
        />
        <button 
          type="submit"
          className="bg-blue-900 hover:bg-blue-700 text-white px-3 rounded text-xs transition-colors whitespace-nowrap"
        >
          검색
        </button>
      </form>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full left-0 mt-1 w-full min-w-[280px] max-h-72 overflow-y-auto bg-[#131926] border border-gray-700 rounded-lg shadow-2xl divide-y divide-gray-800">
          {suggestions.map((s, idx) => {
            const isSelected = selectedIndex === idx;
            return (
              <li 
                key={`${s.ticker}-${idx}`}
                onClick={() => handleSelect(s.ticker)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`px-3 py-2 text-xs cursor-pointer flex justify-between items-center transition-colors ${
                  isSelected ? 'bg-blue-900/60 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-bold text-white text-xs">{s.name || s.ticker}</span>
                  <span className="text-cyan-400 font-mono text-[11px]">{s.ticker}</span>
                </div>
                <span className="text-[10px] text-gray-400 bg-black/60 px-1.5 py-0.5 rounded border border-gray-800 truncate max-w-[70px]">
                  {s.exchange}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
