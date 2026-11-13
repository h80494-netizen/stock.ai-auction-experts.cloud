'use client';

import React, { useState, useEffect } from 'react';

export interface UserTradingAccountInfo {
  user_id: string;
  is_connected: boolean;
  broker_code: string;
  broker_name: string;
  account_nickname: string;
  account_mode: 'PAPER' | 'LIVE' | string;
  account_no: string;
  acnt_prdt_cd: string;
  account_display: string;
  has_api_keys: boolean;
  app_key_masked: string;
  max_total_capital: number;
  max_per_stock_capital: number;
  max_stocks: number;
  etf_order_qty: number;
  etf_auto_trade: boolean;
  updated_at?: string;
}

interface BrokerOption {
  code: string;
  name: string;
}

interface UserTradingAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName?: string;
  isAdmin?: boolean;
  onSaved?: (account: UserTradingAccountInfo) => void;
}

const DEFAULT_BROKERS: BrokerOption[] = [
  { code: 'KIS', name: '한국투자증권' },
  { code: 'KIWOOM', name: '키움증권' },
  { code: 'MIRAE', name: '미래에셋증권' },
  { code: 'SAMSUNG', name: '삼성증권' },
  { code: 'NH', name: 'NH투자증권(나무)' },
  { code: 'KB', name: 'KB증권' },
  { code: 'DAISHIN', name: '대신증권(크레온)' },
  { code: 'TOSS', name: '토스증권' },
];

export default function UserTradingAccountModal({
  isOpen,
  onClose,
  userId,
  userName = '회원',
  isAdmin = false,
  onSaved,
}: UserTradingAccountModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brokers, setBrokers] = useState<BrokerOption[]>(DEFAULT_BROKERS);
  const [accountInfo, setAccountInfo] = useState<UserTradingAccountInfo | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [brokerCode, setBrokerCode] = useState('KIS');
  const [accountNickname, setAccountNickname] = useState('');
  const [accountMode, setAccountMode] = useState<'PAPER' | 'LIVE'>('PAPER');
  const [accountNo, setAccountNo] = useState('');
  const [acntPrdtCd, setAcntPrdtCd] = useState('01');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [maxTotalCapital, setMaxTotalCapital] = useState(100000000);
  const [maxPerStockCapital, setMaxPerStockCapital] = useState(5000000);
  const [etfOrderQty, setEtfOrderQty] = useState(100);
  const [etfAutoTrade, setEtfAutoTrade] = useState(true);

  const loadAccount = async () => {
    if (!userId) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/user/trading-account?user_id=${encodeURIComponent(userId)}`, {
        headers: { 'x-user-id': userId },
      });
      const js = await res.json();
      if (js.supported_brokers && Array.isArray(js.supported_brokers) && js.supported_brokers.length > 0) {
        setBrokers(js.supported_brokers);
      }
      if (js.data) {
        const d: UserTradingAccountInfo = js.data;
        setAccountInfo(d);
        setBrokerCode(d.broker_code || 'KIS');
        setAccountNickname(d.account_nickname || `${userName} 전용 계좌`);
        setAccountMode(d.account_mode === 'LIVE' ? 'LIVE' : 'PAPER');
        setAccountNo(d.account_no || '');
        setAcntPrdtCd(d.acnt_prdt_cd || '01');
        setMaxTotalCapital(Number(d.max_total_capital || 100000000));
        setMaxPerStockCapital(Number(d.max_per_stock_capital || 5000000));
        setEtfOrderQty(Number(d.etf_order_qty || 100));
        setEtfAutoTrade(Boolean(d.etf_auto_trade ?? true));
      }
    } catch (e) {
      console.error(e);
      setMsg({ type: 'error', text: '계좌 설정 정보를 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAccount();
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const cleanAcc = accountNo.trim().replace(/[^0-9]/g, '');
    if (!cleanAcc || cleanAcc.length < 6) {
      setMsg({ type: 'error', text: '본인 증권사 계좌번호(앞 8~12자리 숫자)를 정확히 입력해 주세요.' });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        user_id: userId,
        broker_code: brokerCode,
        account_nickname: accountNickname.trim() || `${userName} 전용 계좌`,
        account_mode: accountMode,
        account_no: cleanAcc,
        acnt_prdt_cd: (acntPrdtCd.trim() || '01').slice(0, 2),
        max_total_capital: Number(maxTotalCapital) || 100000000,
        max_per_stock_capital: Number(maxPerStockCapital) || 5000000,
        etf_order_qty: Math.max(1, Number(etfOrderQty) || 100),
        etf_auto_trade: etfAutoTrade,
      };
      if (appKey.trim()) payload.app_key = appKey.trim();
      if (appSecret.trim()) payload.app_secret = appSecret.trim();

      const res = await fetch('/api/user/trading-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify(payload),
      });
      const js = await res.json();
      if (res.ok && js.success) {
        setAccountInfo(js.data);
        setAppKey('');
        setAppSecret('');
        setMsg({
          type: 'success',
          text: `✅ [${js.data.broker_name} ${js.data.account_display}] 개별 트레이딩 계좌 연결이 완료되었습니다!`,
        });
        if (onSaved && js.data) {
          onSaved(js.data);
        }
      } else {
        setMsg({ type: 'error', text: js.detail || js.message || '계좌 저장에 실패했습니다.' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버와 통신 중 오류가 발생했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (isAdmin && userId === 'admin') {
      setMsg({ type: 'error', text: '관리자(주인장) 기본 계좌는 연결 해제 대상이 아닙니다.' });
      return;
    }
    if (!confirm('현재 연결된 내 증권사 계좌 정보를 해제하시겠습니까?')) return;

    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/user/trading-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          user_id: userId,
          disconnect: true,
        }),
      });
      const js = await res.json();
      if (res.ok && js.success) {
        setAccountInfo(js.data);
        setAccountNo('');
        setAppKey('');
        setAppSecret('');
        setMsg({ type: 'success', text: '계좌 연결이 해제되었습니다.' });
        if (onSaved && js.data) {
          onSaved(js.data);
        }
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '계좌 해제 중 오류가 발생했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0e131f] border border-cyan-500/40 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 text-gray-100 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🏦</span>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                {userName}님의 개별 증권사 계좌 연결 & 독립 트레이딩 설정
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  accountInfo?.is_connected
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                    : 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                }`}
              >
                {accountInfo?.is_connected
                  ? `연결됨 (${accountInfo.broker_name} ${accountInfo.account_display})`
                  : '미연결 (계좌 등록 필요)'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              회원별로 완전히 분리된 독립 트레이딩 계좌입니다. 타 회원은 회원님의 계좌번호나 매매 기록을 절대 볼 수 없습니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
          >
            ✕ 닫기
          </button>
        </div>

        {/* Confidentiality Banner */}
        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3.5 text-xs text-indigo-200 space-y-1">
          <div className="font-bold text-indigo-300 flex items-center gap-1.5">
            <span>🔒</span>
            <span>회원 간 100% 비밀 보장 및 독립 원장 운용 안내</span>
          </div>
          <p className="text-gray-300 leading-relaxed">
            • 주인장(관리자)의 매매 기록이나 타 회원의 계좌는 서로 보이지 않으며, 오직 본인이 연결한 증권사 계좌로만 국내 매수주문 및 미국 ETF 장마감 자동매매가 기록·운용됩니다.
          </p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">계좌 설정을 불러오는 중입니다...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {/* 1. 증권사 & 운용모드 선택 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">1. 연결할 증권사 선택 *</label>
                <select
                  value={brokerCode}
                  onChange={(e) => setBrokerCode(e.target.value)}
                  className="w-full bg-[#161d2f] border border-gray-700 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold outline-none"
                >
                  {brokers.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">2. 계좌 운용 구분 *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountMode('PAPER')}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      accountMode === 'PAPER'
                        ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200 shadow-inner'
                        : 'bg-[#161d2f] border-gray-700 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    🧪 모의투자 계좌
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountMode('LIVE')}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      accountMode === 'LIVE'
                        ? 'bg-rose-600/30 border-rose-400 text-rose-200 shadow-inner'
                        : 'bg-[#161d2f] border-gray-700 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    🔥 실전투자 계좌
                  </button>
                </div>
              </div>
            </div>

            {/* 2. 계좌번호 & 계좌별칭 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  3. 본인 증권사 계좌번호 (앞 8~12자리) + 상품코드(2자리) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="예: 50123456"
                    value={accountNo}
                    onChange={(e) => setAccountNo(e.target.value)}
                    className="flex-1 bg-[#161d2f] border border-gray-700 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none"
                    required
                  />
                  <span className="text-gray-500 font-bold">-</span>
                  <input
                    type="text"
                    placeholder="01"
                    maxLength={2}
                    value={acntPrdtCd}
                    onChange={(e) => setAcntPrdtCd(e.target.value)}
                    className="w-16 bg-[#161d2f] border border-gray-700 focus:border-cyan-400 rounded-xl px-2.5 py-2.5 text-xs text-center text-white font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">4. 내 계좌 별칭</label>
                <input
                  type="text"
                  placeholder="예: 홍길동 주계좌"
                  value={accountNickname}
                  onChange={(e) => setAccountNickname(e.target.value)}
                  className="w-full bg-[#161d2f] border border-gray-700 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                />
              </div>
            </div>

            {/* 3. OpenAPI Key / Secret (선택) */}
            <div className="bg-[#131a29] border border-gray-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300">
                  🔑 증권사 OpenAPI Key / Secret 등록 (선택사항 · 암호화 보관)
                </span>
                {accountInfo?.has_api_keys && (
                  <span className="text-[11px] text-emerald-400 font-mono">
                    현재 등록됨 ({accountInfo.app_key_masked})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                API Key를 입력하시면 실서버 API 주문이 함께 전송되며, 비워두셔도 등록하신 계좌번호 기준 개별 모의/트레이딩 원장으로 모든 주문과 수익률이 독립 관리됩니다.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">App Key (변경 시에만 입력)</label>
                  <input
                    type="password"
                    placeholder={accountInfo?.has_api_keys ? '기존 API Key 유지됨' : '증권사 발급 App Key (선택)'}
                    value={appKey}
                    onChange={(e) => setAppKey(e.target.value)}
                    className="w-full bg-[#0d121d] border border-gray-700 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">App Secret (변경 시에만 입력)</label>
                  <input
                    type="password"
                    placeholder={accountInfo?.has_api_keys ? '기존 App Secret 유지됨' : '증권사 발급 App Secret (선택)'}
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    className="w-full bg-[#0d121d] border border-gray-700 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 4. 국내 주식 & 미국 ETF 개별 운용 한도 설정 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-[#131a29] border border-gray-800 rounded-xl p-3.5">
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  국내 총 운용자금 한도 (원)
                </label>
                <input
                  type="number"
                  step={1000000}
                  min={1000000}
                  value={maxTotalCapital}
                  onChange={(e) => setMaxTotalCapital(Number(e.target.value))}
                  className="w-full bg-[#0d121d] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  국내 종목당 최대 매수 (원)
                </label>
                <input
                  type="number"
                  step={500000}
                  min={500000}
                  value={maxPerStockCapital}
                  onChange={(e) => setMaxPerStockCapital(Number(e.target.value))}
                  className="w-full bg-[#0d121d] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  미국 ETF 기본 주문수량 (주)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={etfOrderQty}
                  onChange={(e) => setEtfOrderQty(Number(e.target.value))}
                  className="w-full bg-[#0d121d] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between bg-[#131a29] border border-gray-800 rounded-xl px-4 py-3">
              <div>
                <div className="text-xs font-bold text-white">
                  미국 주식시장 장마감 10분 전(15:50 ET) ETF 예약 자동매매 활성화
                </div>
                <div className="text-[11px] text-gray-400">
                  장마감 10분 전 최종 신호 확정 시 기존 ETF 매도 및 신규 1위 ETF 매수를 내 계좌로 자동 집행합니다.
                </div>
              </div>
              <input
                type="checkbox"
                checked={etfAutoTrade}
                onChange={(e) => setEtfAutoTrade(e.target.checked)}
                className="w-4 h-4 accent-cyan-500 cursor-pointer"
              />
            </div>

            {msg && (
              <div
                className={`p-3 rounded-xl text-xs font-bold border ${
                  msg.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                }`}
              >
                {msg.text}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              {accountInfo?.is_connected && userId !== 'admin' ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-rose-950/80 border border-gray-700 hover:border-rose-500/50 text-gray-300 hover:text-rose-200 text-xs font-bold transition-all cursor-pointer"
                >
                  🔌 계좌 연결 해제
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-extrabold shadow-lg cursor-pointer"
                >
                  {saving ? '저장 중...' : '💾 내 증권사 계좌 연결 저장'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

