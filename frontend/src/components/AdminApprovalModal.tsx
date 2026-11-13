'use client';

import React, { useState } from 'react';

interface UserRequestItem {
  id: number;
  name: string;
  phone: string;
  email: string;
  requested_password: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  approved_at: string | null;
}

interface UserTradingOverviewItem {
  user_id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  account: {
    user_id: string;
    is_connected: boolean;
    broker_code: string;
    broker_name: string;
    account_nickname: string;
    account_mode: string;
    account_display: string;
    has_api_keys: boolean;
    max_total_capital: number;
    etf_order_qty: number;
    etf_auto_trade: boolean;
  };
  holdings: Array<{
    ticker: string;
    name: string;
    qty: number;
    buyPrice: number;
  }>;
  holdings_count: number;
  holdings_eval_krw: number;
  total_realized_pnl_krw: number;
  trading_days_count: number;
  recent_trades: Array<{
    date: string;
    ticker: string;
    name: string;
    qty: number;
    buy_price: number;
    sell_price?: number;
    pnl?: number;
    status: string;
  }>;
  etf_us_holdings?: Array<{
    ticker: string;
    name: string;
    qty: number;
    avg_buy_price_usd: number;
    curr_price_usd: number;
    eval_amount_usd: number;
  }>;
  etf_us_recent_orders?: Array<{
    executed_at_kst: string;
    side: string;
    ticker: string;
    qty: number;
    exec_price_usd: number;
    account_no: string;
    broker_status: string;
  }>;
  etf_us_total_eval_usd?: number;
}

interface AdminApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInspectUser?: (userId: string, userName: string) => void;
}

export default function AdminApprovalModal({
  isOpen,
  onClose,
  onInspectUser,
}: AdminApprovalModalProps) {
  const [adminPassword, setAdminPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'requests' | 'trading'>('requests');
  const [requests, setRequests] = useState<UserRequestItem[]>([]);
  const [tradingOverview, setTradingOverview] = useState<UserTradingOverviewItem[]>([]);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<number, boolean>>({});

  // 비밀번호 수정 인라인 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const fetchAllAdminData = async (pwd?: string) => {
    const targetPassword = pwd || adminPassword;
    if (!targetPassword) {
      setMsg({ type: 'error', text: '관리자 암호를 입력해 주세요.' });
      return;
    }

    setIsLoading(true);
    setMsg(null);

    try {
      const [reqRes, ovRes] = await Promise.all([
        fetch('/api/auth/admin/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_password: targetPassword }),
        }),
        fetch('/api/auth/admin/trading-overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_password: targetPassword }),
        }),
      ]);

      const reqData = await reqRes.json();
      if (reqRes.ok && reqData.status === 'success') {
        setRequests(reqData.data || []);
      } else {
        setMsg({ type: 'error', text: reqData.detail || '관리자 권한 인증에 실패했습니다.' });
        setIsLoading(false);
        return;
      }

      if (ovRes.ok) {
        const ovData = await ovRes.json();
        if (ovData.status === 'success') {
          setTradingOverview(ovData.data || []);
        }
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버와 통신할 수 없습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (requestId: number, newStatus: 'approved' | 'rejected' | 'pending') => {
    if (!adminPassword) {
      setMsg({ type: 'error', text: '관리자 암호를 먼저 입력해 주세요.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_password: adminPassword,
          request_id: requestId,
          status: newStatus,
        }),
      });
      if (res.ok) {
        fetchAllAdminData(adminPassword);
      } else {
        setMsg({ type: 'error', text: '상태 변경에 실패했습니다.' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '오류가 발생했습니다.' });
    }
  };

  const handleResetPassword = async (requestId: number) => {
    if (!adminPassword) {
      setMsg({ type: 'error', text: '관리자 암호가 필요합니다.' });
      return;
    }
    if (!newPasswordInput.trim() || newPasswordInput.trim().length < 4) {
      setMsg({ type: 'error', text: '새 비밀번호는 4자리 이상 입력해 주세요.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_password: adminPassword,
          request_id: requestId,
          new_password: newPasswordInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: '비밀번호가 성공적으로 수정되었습니다.' });
        setEditingId(null);
        setNewPasswordInput('');
        fetchAllAdminData(adminPassword);
      } else {
        setMsg({ type: 'error', text: data.detail || data.message || '비밀번호 변경 실패' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버 통신 실패' });
    }
  };

  const toggleShowPassword = (id: number) => {
    setShowPasswordMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#121318] border border-red-500/50 rounded-2xl p-6 max-w-6xl w-full space-y-4 shadow-2xl max-h-[92vh] flex flex-col text-gray-200">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <h3 className="text-lg font-bold text-red-400">
              주인장(관리자) 회원 승인 & 전 회원 개별 계좌 감독 센터
            </h3>
            <span className="text-[10px] bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full font-mono">
              ADMIN ONLY · 회원 간 비밀 격리됨
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm cursor-pointer">
            ✕ 닫기
          </button>
        </div>

        {/* 관리자 암호 검증 바 & 탭 선택 */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/90 p-3.5 rounded-xl border border-gray-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-300 font-bold whitespace-nowrap">관리자 마스터 암호:</span>
            <input
              type="password"
              placeholder="관리자 암호 입력"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchAllAdminData();
              }}
              className="bg-black border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono outline-none focus:border-red-500 w-44"
              autoFocus
            />
            <button
              onClick={() => fetchAllAdminData()}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow cursor-pointer"
            >
              {isLoading ? '조회 중...' : '조회 / 새로고침'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'requests'
                  ? 'bg-red-600 text-white shadow'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              👥 회원 승인/비번 관리 ({requests.length}명)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('trading')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'trading'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              📊 회원별 개별 계좌 & 트레이딩 현황 ({tradingOverview.length}계정)
            </button>
          </div>
        </div>

        {msg && (
          <div
            className={`text-xs p-2.5 rounded-lg border font-semibold ${
              msg.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                : 'bg-red-950/60 border-red-700 text-red-300'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* 탭 1: 신청자 DB 테이블 */}
        {activeTab === 'requests' ? (
          <div className="flex-1 overflow-y-auto border border-gray-800 rounded-xl bg-black/60 min-h-[320px]">
            {isLoading ? (
              <div className="p-12 text-center text-xs text-gray-400 animate-pulse">
                승인 데이터 조회 중입니다...
              </div>
            ) : requests.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-500">
                {adminPassword
                  ? '등록된 승인 요청 내역이 없거나 조회되지 않았습니다.'
                  : '관리자 암호를 입력하고 [조회 / 새로고침] 버튼을 눌러주세요.'}
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-900/90 text-gray-400 uppercase font-mono border-b border-gray-800 sticky top-0 backdrop-blur-sm">
                  <tr>
                    <th className="p-2.5">고유ID</th>
                    <th className="p-2.5">성함</th>
                    <th className="p-2.5">연락처</th>
                    <th className="p-2.5">이메일</th>
                    <th className="p-2.5">비밀번호</th>
                    <th className="p-2.5">신청일시</th>
                    <th className="p-2.5">상태</th>
                    <th className="p-2.5 text-center">승인 및 비번관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-mono text-gray-300">
                  {requests.map((req) => {
                    const isPwVisible = !!showPasswordMap[req.id];
                    const isEditingThis = editingId === req.id;

                    return (
                      <tr key={req.id} className="hover:bg-gray-900/60 transition-colors">
                        <td className="p-2.5 text-gray-500">user_{req.id}</td>
                        <td className="p-2.5 font-bold text-white">{req.name}</td>
                        <td className="p-2.5 text-cyan-300">{req.phone}</td>
                        <td className="p-2.5 text-gray-400">{req.email || '-'}</td>

                        <td className="p-2.5">
                          {isEditingThis ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="새 비번"
                                value={newPasswordInput}
                                onChange={(e) => setNewPasswordInput(e.target.value)}
                                className="w-20 bg-gray-900 border border-yellow-500 rounded px-1.5 py-0.5 text-xs text-yellow-300 font-mono outline-none"
                              />
                              <button
                                onClick={() => handleResetPassword(req.id)}
                                className="bg-yellow-600 hover:bg-yellow-500 text-black px-1.5 py-0.5 rounded text-[10px] font-bold"
                              >
                                저장
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setNewPasswordInput('');
                                }}
                                className="bg-gray-700 text-gray-300 px-1 py-0.5 rounded text-[10px]"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-yellow-400">
                                {isPwVisible ? req.requested_password : '••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleShowPassword(req.id)}
                                className="text-[10px] text-gray-500 hover:text-gray-300 px-1 py-0.5 border border-gray-700 rounded"
                              >
                                {isPwVisible ? '숨김' : '보기'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(req.id);
                                  setNewPasswordInput(req.requested_password);
                                }}
                                className="text-[10px] text-cyan-400 hover:text-cyan-300 px-1 py-0.5 border border-cyan-800 rounded ml-1"
                              >
                                수정
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="p-2.5 text-gray-400 text-[11px] whitespace-nowrap">{req.created_at}</td>

                        <td className="p-2.5 whitespace-nowrap">
                          {req.status === 'approved' && (
                            <span className="bg-emerald-950 text-emerald-400 border border-emerald-700 px-2 py-0.5 rounded text-[11px] font-bold">
                              승인됨
                            </span>
                          )}
                          {req.status === 'rejected' && (
                            <span className="bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded text-[11px] font-bold">
                              거절됨
                            </span>
                          )}
                          {req.status === 'pending' && (
                            <span className="bg-amber-950 text-amber-300 border border-amber-700 px-2 py-0.5 rounded text-[11px] font-bold">
                              대기 중
                            </span>
                          )}
                        </td>

                        <td className="p-2.5 text-center space-x-1 whitespace-nowrap">
                          {req.status !== 'approved' && (
                            <button
                              onClick={() => handleStatusChange(req.id, 'approved')}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[11px] font-bold transition-all shadow"
                            >
                              승인
                            </button>
                          )}
                          {req.status !== 'rejected' && (
                            <button
                              onClick={() => handleStatusChange(req.id, 'rejected')}
                              className="bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded text-[11px] font-bold transition-all shadow"
                            >
                              거절
                            </button>
                          )}
                          {req.status !== 'pending' && (
                            <button
                              onClick={() => handleStatusChange(req.id, 'pending')}
                              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded text-[11px] font-bold transition-all shadow"
                            >
                              대기
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* 탭 2: 전 회원 개별 증권사 계좌 및 트레이딩 현황 감독 (관리자 전용) */
          <div className="flex-1 overflow-y-auto border border-gray-800 rounded-xl bg-black/60 min-h-[320px] p-4 space-y-3">
            {isLoading ? (
              <div className="p-12 text-center text-xs text-gray-400 animate-pulse">
                전 회원 계좌 및 트레이딩 현황 조회 중입니다...
              </div>
            ) : tradingOverview.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-500">
                관리자 암호를 입력하고 [조회 / 새로고침] 버튼을 눌러주세요.
              </div>
            ) : (
              tradingOverview.map((item) => {
                const acc = item.account;
                const etfHoldings = item.etf_us_holdings || [];
                return (
                  <div
                    key={item.user_id}
                    className={`rounded-xl border p-4 space-y-3 ${
                      item.user_id === 'admin'
                        ? 'bg-indigo-950/20 border-indigo-500/40'
                        : 'bg-gray-900/70 border-gray-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                            item.user_id === 'admin'
                              ? 'bg-red-950 text-red-300 border border-red-700'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                          }`}
                        >
                          {item.user_id}
                        </span>
                        <span className="text-sm font-extrabold text-white">{item.name}</span>
                        {item.phone && item.phone !== '-' && (
                          <span className="text-xs text-gray-400 font-mono">({item.phone})</span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            acc.is_connected
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/50'
                              : 'bg-gray-800 text-gray-400 border border-gray-700'
                          }`}
                        >
                          {acc.is_connected
                            ? `🏦 ${acc.broker_name} [${acc.account_mode}] ${acc.account_display}`
                            : '🔒 증권사 계좌 미연결'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400">
                          국내 실현손익:{' '}
                          <strong
                            className={
                              item.total_realized_pnl_krw >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {item.total_realized_pnl_krw >= 0 ? '+' : ''}
                            {Math.round(item.total_realized_pnl_krw).toLocaleString()}원
                          </strong>
                        </span>
                        <span className="text-gray-400">
                          미국 ETF 평가액:{' '}
                          <strong className="text-cyan-300">
                            ${(item.etf_us_total_eval_usd || 0).toLocaleString()}
                          </strong>
                        </span>
                        {onInspectUser && (
                          <button
                            type="button"
                            onClick={() => {
                              onInspectUser(item.user_id, item.name);
                              onClose();
                            }}
                            className="bg-cyan-700 hover:bg-cyan-600 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            🔍 이 회원 계좌 화면 열람
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* 국내 보유 종목 */}
                      <div className="bg-black/40 border border-gray-800/80 rounded-lg p-2.5">
                        <div className="font-bold text-gray-300 mb-1.5 flex items-center justify-between">
                          <span>🇰🇷 국내주식 보유종목 ({item.holdings_count}종목)</span>
                          <span className="text-gray-400 font-mono">
                            매수평가: {Math.round(item.holdings_eval_krw).toLocaleString()}원
                          </span>
                        </div>
                        {item.holdings.length === 0 ? (
                          <div className="text-gray-500 text-[11px] py-1">현재 보유 중인 국내 종목 없음</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {item.holdings.map((h) => (
                              <span
                                key={h.ticker}
                                className="bg-gray-800/90 border border-gray-700 px-2 py-0.5 rounded text-[11px] text-gray-200 font-mono"
                              >
                                {h.name}({h.ticker}) {h.qty}주 @{Math.round(h.buyPrice).toLocaleString()}원
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 미국 ETF 보유 종목 */}
                      <div className="bg-black/40 border border-gray-800/80 rounded-lg p-2.5">
                        <div className="font-bold text-gray-300 mb-1.5 flex items-center justify-between">
                          <span>🇺🇸 미국 ETF 보유종목 ({etfHoldings.length}종목)</span>
                          <span className="text-gray-400 font-mono">
                            기본주문: {acc.etf_order_qty}주 / 자동매매: {acc.etf_auto_trade ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        {etfHoldings.length === 0 ? (
                          <div className="text-gray-500 text-[11px] py-1">현재 보유 중인 미국 ETF 없음</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {etfHoldings.map((eh) => (
                              <span
                                key={eh.ticker}
                                className="bg-indigo-950/70 border border-indigo-700/60 px-2 py-0.5 rounded text-[11px] text-indigo-200 font-mono"
                              >
                                {eh.ticker} {eh.qty}주 (${eh.curr_price_usd})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 닫기 버튼 */}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-700 text-white font-bold px-6 py-2 rounded-xl text-xs transition-all cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
