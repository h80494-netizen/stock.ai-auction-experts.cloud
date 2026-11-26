'use client';

import React, { useState, useEffect, useMemo } from 'react';

interface UserRequestItem {
  id: number;
  login_id?: string;
  name: string;
  phone: string;
  email: string;
  requested_password: string;
  email_verified?: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  approved_at: string | null;
}

interface UserTradingOverviewItem {
  user_id: string;
  name: string;
  phone: string;
  role?: string;
  status: string;
  account: {
    user_id: string;
    is_connected: boolean;
    broker_code: string;
    broker_name: string;
    account_nickname?: string;
    account_mode: string;
    account_display: string;
    has_api_keys: boolean;
    max_total_capital: number;
    etf_order_qty: number;
    etf_auto_trade: boolean;
  };
  kr_holdings?: Array<{
    ticker: string;
    name: string;
    qty: number;
    buyPrice: number;
  }>;
  holdings?: Array<{
    ticker: string;
    name: string;
    qty: number;
    buyPrice: number;
  }>;
  kr_holdings_count?: number;
  holdings_count?: number;
  holdings_eval_krw?: number;
  kr_total_net_pnl?: number;
  total_realized_pnl_krw?: number;
  kr_trade_days?: number;
  trading_days_count?: number;
  etf_us_holdings?: Array<{
    ticker: string;
    name: string;
    qty: number;
    avg_buy_price_usd: number;
    curr_price_usd: number;
    eval_amount_usd: number;
  }>;
  etf_us_total_eval_usd?: number;
}

interface MenuAccessPolicy {
  mode: 'ALL_APPROVED' | 'SELECTED_USERS' | 'ADMIN_ONLY';
  restricted_menus: string[];
  allowed_user_ids: string[];
  menu_allowed_users: Record<string, string[]>;
  notice_message: string;
  updated_at?: string;
}

interface AdminApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInspectUser?: (userId: string, userName: string) => void;
  onPolicyUpdated?: () => void;
}

const RESTRICTED_MENU_META = [
  { id: 'integrated_pnl', label: '📋 통합손익관리표', shortLabel: '통합손익관리표' },
  { id: 'futures_sim', label: '🚀 선물오버나잇자동매매', shortLabel: '선물오버나잇' },
  { id: 'order', label: '🚨 매수주문 (Orders)', shortLabel: '매수주문' },
  { id: 'etf_strategy', label: '⚡ ETF 투자전략', shortLabel: 'ETF투자전략' },
  { id: 'etf_history', label: '📜 시뮬레이션 히스토리', shortLabel: '시뮬레이션히스토리' },
];

export default function AdminApprovalModal({
  isOpen,
  onClose,
  onInspectUser,
  onPolicyUpdated,
}: AdminApprovalModalProps) {
  const [adminPassword, setAdminPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'requests' | 'trading' | 'settings'>('requests');
  const [requests, setRequests] = useState<UserRequestItem[]>([]);
  const [tradingOverview, setTradingOverview] = useState<UserTradingOverviewItem[]>([]);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<number, boolean>>({});

  // 4대 핵심 트레이딩 메뉴 이용권한 제어 (3단계 모드) 상태
  const [menuPolicy, setMenuPolicy] = useState<MenuAccessPolicy>({
    mode: 'SELECTED_USERS',
    restricted_menus: ['futures_sim', 'order', 'etf_strategy', 'etf_history'],
    allowed_user_ids: [],
    menu_allowed_users: {
      futures_sim: [],
      order: [],
      etf_strategy: [],
      etf_history: [],
    },
    notice_message:
      '현재 [선물오버나잇자동매매 · 매수주문 · ETF투자전략 · 시뮬레이션히스토리] 기능은 시스템 운영 정책에 따라 [관리자 및 지정 회원 전용 모드]로 이용이 제한되어 있습니다. 일반 회원분들은 재무분석·리포트·시세·종목필터링 메뉴를 이용하실 수 있습니다.',
  });
  const [selectedMenuScope, setSelectedMenuScope] = useState<'ALL_4_MENUS' | string>('ALL_4_MENUS');
  const [savingPolicy, setSavingPolicy] = useState(false);

  // 비밀번호 수정 인라인 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // 관리자 마스터 비밀번호 변경 & 이메일 SMTP 설정 상태
  const [newAdminMasterPw, setNewAdminMasterPw] = useState('');
  const [confirmAdminMasterPw, setConfirmAdminMasterPw] = useState('');
  const [smtpForm, setSmtpForm] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_sender_name: 'AI Stock Expert 2.0',
    is_configured: false,
  });

  // 모달 열릴 때 즉시 메뉴 정책 및 회원 목록 자동 조회
  useEffect(() => {
    if (isOpen) {
      fetchMenuPolicyOnly();
      if (adminPassword) {
        fetchAllAdminData(adminPassword);
      }
    }
  }, [isOpen]);

  const fetchMenuPolicyOnly = async (pwd?: string) => {
    try {
      const res = await fetch('/api/auth/admin/menu-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password: pwd || adminPassword || '' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          setMenuPolicy(data.data);
          if (Array.isArray(data.users) && requests.length === 0) {
            setRequests(data.users);
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchAllAdminData = async (pwd?: string) => {
    const targetPassword = pwd !== undefined ? pwd : adminPassword;
    setIsLoading(true);
    setMsg(null);

    try {
      // 메뉴 정책은 암호 없이도 관리자 세션에서 바로 로드
      await fetchMenuPolicyOnly(targetPassword);

      if (!targetPassword) {
        setIsLoading(false);
        return;
      }

      const [reqRes, ovRes, smtpRes] = await Promise.all([
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
        fetch('/api/auth/admin/smtp-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_password: targetPassword }),
        }),
      ]);

      const reqData = await reqRes.json();
      if (reqRes.ok && reqData.status === 'success') {
        setRequests(reqData.data || []);
      } else {
        setMsg({ type: 'error', text: reqData.detail || '관리자 마스터 암호가 일치하지 않습니다.' });
        setIsLoading(false);
        return;
      }

      if (ovRes.ok) {
        const ovData = await ovRes.json();
        if (ovData.status === 'success') {
          setTradingOverview(ovData.data || []);
        }
      }

      if (smtpRes.ok) {
        const smtpData = await smtpRes.json();
        if (smtpData.status === 'success' && smtpData.data) {
          setSmtpForm({
            smtp_host: smtpData.data.smtp_host || 'smtp.gmail.com',
            smtp_port: smtpData.data.smtp_port || 587,
            smtp_user: smtpData.data.smtp_user || '',
            smtp_password: smtpData.data.smtp_password_masked || '',
            smtp_sender_name: smtpData.data.smtp_sender_name || 'AI Stock Expert 2.0',
            is_configured: !!smtpData.data.is_configured,
          });
        }
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버와 통신할 수 없습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  // 정책 즉시 저장 헬퍼
  const persistMenuPolicy = async (nextPolicy: MenuAccessPolicy, showToast: boolean = true) => {
    setMenuPolicy(nextPolicy);
    setSavingPolicy(true);
    try {
      const res = await fetch('/api/auth/admin/save-menu-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_password: adminPassword.trim(),
          mode: nextPolicy.mode,
          allowed_user_ids: nextPolicy.allowed_user_ids,
          menu_allowed_users: nextPolicy.menu_allowed_users,
          notice_message: nextPolicy.notice_message,
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setMenuPolicy(data.data);
        if (showToast) {
          setMsg({
            type: 'success',
            text: data.message || '✅ 4대 트레이딩 메뉴 이용권한 설정이 저장되었습니다.',
          });
        }
        if (onPolicyUpdated) onPolicyUpdated();
      } else {
        setMsg({ type: 'error', text: data.detail || '이용권한 정책 저장 실패' });
      }
    } catch {
      setMsg({ type: 'error', text: '서버 통신 오류로 정책을 저장하지 못했습니다.' });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleModeChange = (newMode: 'ALL_APPROVED' | 'SELECTED_USERS' | 'ADMIN_ONLY') => {
    let defaultNotice = menuPolicy.notice_message;
    if (newMode === 'ADMIN_ONLY') {
      defaultNotice =
        '현재 [선물오버나잇자동매매 · 매수주문 · ETF투자전략 · 시뮬레이션히스토리] 기능은 시스템 운영 정책에 따라 [관리자 1인 전용 모드]로 이용이 제한되어 있습니다. 일반 회원분들은 재무분석·리포트·시세·종목필터링 메뉴를 이용하실 수 있습니다.';
    } else if (newMode === 'SELECTED_USERS') {
      defaultNotice =
        '현재 [선물오버나잇자동매매 · 매수주문 · ETF투자전략 · 시뮬레이션히스토리] 기능은 시스템 운영 정책에 따라 [관리자 및 지정 허용 회원 전용 모드]로 운영 중입니다. 신규 가입 및 미지정 회원분들은 일반 분석 메뉴를 이용하실 수 있습니다.';
    } else {
      defaultNotice =
        '현재 모든 승인된 정회원에게 [선물오버나잇자동매매 · 매수주문 · ETF투자전략 · 시뮬레이션히스토리] 메뉴가 전체 개방되어 있습니다.';
    }
    const nextPolicy: MenuAccessPolicy = {
      ...menuPolicy,
      mode: newMode,
      notice_message: defaultNotice,
    };
    persistMenuPolicy(nextPolicy);
  };

  // 회원 칩 클릭 시 즉시 권한 ON / OFF 토글
  const handleToggleUserPermission = (uid: string) => {
    const curGlobal = new Set(menuPolicy.allowed_user_ids || []);
    const nextMenuMap = { ...(menuPolicy.menu_allowed_users || {}) };

    if (selectedMenuScope === 'ALL_4_MENUS') {
      const isCurrentlyOn = curGlobal.has(uid);
      if (isCurrentlyOn) {
        curGlobal.delete(uid);
        RESTRICTED_MENU_META.forEach((m) => {
          const s = new Set(nextMenuMap[m.id] || []);
          s.delete(uid);
          nextMenuMap[m.id] = Array.from(s);
        });
      } else {
        curGlobal.add(uid);
        RESTRICTED_MENU_META.forEach((m) => {
          const s = new Set(nextMenuMap[m.id] || []);
          s.add(uid);
          nextMenuMap[m.id] = Array.from(s);
        });
      }
    } else {
      // 특정 메뉴 1개에 대해서만 토글
      const targetSet = new Set(nextMenuMap[selectedMenuScope] || []);
      if (targetSet.has(uid)) {
        targetSet.delete(uid);
        curGlobal.delete(uid);
      } else {
        targetSet.add(uid);
      }
      nextMenuMap[selectedMenuScope] = Array.from(targetSet);
    }

    const nextPolicy: MenuAccessPolicy = {
      ...menuPolicy,
      mode: menuPolicy.mode === 'SELECTED_USERS' ? 'SELECTED_USERS' : 'SELECTED_USERS',
      allowed_user_ids: Array.from(curGlobal),
      menu_allowed_users: nextMenuMap,
    };
    persistMenuPolicy(nextPolicy, false);
  };

  // 통계 계산 (상단 5대 KPI 카드용)
  const approvedUsers = useMemo(
    () => requests.filter((r) => r.status === 'approved'),
    [requests]
  );
  const pendingUsers = useMemo(
    () => requests.filter((r) => r.status === 'pending'),
    [requests]
  );
  const rejectedUsers = useMemo(
    () => requests.filter((r) => r.status === 'rejected'),
    [requests]
  );

  // 관리자 본인을 제외한 일반 정회원 리스트 (권한 지정 칩 표시용)
  const selectableMembers = useMemo(() => {
    return approvedUsers
      .filter(
        (u) =>
          u.id !== 1 &&
          (u.email || '').toLowerCase() !== 'h80494@gmail.com' &&
          (u.login_id || '').toLowerCase() !== 'admin'
      )
      .map((u) => ({
        uid: `user_${u.id}`,
        id: u.id,
        name: u.name || u.login_id || `회원#${u.id}`,
        login_id: u.login_id || u.name,
        email: u.email,
      }));
  }, [approvedUsers]);

  const activeScopeAllowedSet = useMemo(() => {
    if (selectedMenuScope === 'ALL_4_MENUS') {
      return new Set(menuPolicy.allowed_user_ids || []);
    }
    return new Set(
      (menuPolicy.menu_allowed_users && menuPolicy.menu_allowed_users[selectedMenuScope]) ||
        menuPolicy.allowed_user_ids ||
        []
    );
  }, [menuPolicy, selectedMenuScope]);

  const handleChangeAdminMasterPassword = async () => {
    if (!adminPassword.trim()) {
      setMsg({ type: 'error', text: '상단의 현재 관리자 마스터 암호를 입력해 주세요.' });
      return;
    }
    if (!newAdminMasterPw.trim() || newAdminMasterPw.trim().length < 4) {
      setMsg({ type: 'error', text: '새 관리자 마스터 비밀번호는 4자리 이상 입력해 주세요.' });
      return;
    }
    if (newAdminMasterPw.trim() !== confirmAdminMasterPw.trim()) {
      setMsg({ type: 'error', text: '새 관리자 비밀번호와 확인 비밀번호가 일치하지 않습니다.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/admin/change-master-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_password: adminPassword.trim(),
          new_admin_password: newAdminMasterPw.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const updatedPw = newAdminMasterPw.trim();
        setAdminPassword(updatedPw);
        setNewAdminMasterPw('');
        setConfirmAdminMasterPw('');
        setMsg({ type: 'success', text: data.message || '✅ 관리자 마스터 비밀번호가 변경되었습니다.' });
      } else {
        setMsg({ type: 'error', text: data.detail || '관리자 마스터 비밀번호 변경 실패' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버 통신 오류' });
    }
  };

  const handleSaveSmtpConfig = async () => {
    if (!adminPassword.trim()) {
      setMsg({ type: 'error', text: '상단의 관리자 마스터 암호를 먼저 입력해 주세요.' });
      return;
    }
    try {
      const res = await fetch('/api/auth/admin/save-smtp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_password: adminPassword.trim(),
          smtp_host: smtpForm.smtp_host,
          smtp_port: Number(smtpForm.smtp_port) || 587,
          smtp_user: smtpForm.smtp_user,
          smtp_password: smtpForm.smtp_password,
          smtp_sender_name: smtpForm.smtp_sender_name,
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSmtpForm((prev) => ({ ...prev, is_configured: !!data.data?.is_configured }));
        setMsg({ type: 'success', text: data.message || '✅ 이메일 인증 SMTP 설정이 저장되었습니다.' });
      } else {
        setMsg({ type: 'error', text: data.detail || 'SMTP 설정 저장 실패' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버 통신 오류' });
    }
  };

  const handleStatusChange = async (requestId: number, newStatus: 'approved' | 'rejected' | 'pending') => {
    if (!adminPassword) {
      setMsg({ type: 'error', text: '우측 상단 [관리자 마스터 암호]를 먼저 입력해 주세요.' });
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
    <div className="fixed inset-0 z-[130] bg-[#070b14]/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#0b111e] border border-slate-700/80 rounded-2xl p-4 sm:p-6 max-w-7xl w-full space-y-5 shadow-2xl max-h-[95vh] flex flex-col text-gray-200 overflow-y-auto">
        {/* 👑 상단 통합 관제 센터 헤더 (AI Auction Expert 관리자 센터 스타일) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-2xl">👑</span>
            <span className="text-lg sm:text-xl font-extrabold text-amber-400 tracking-tight">
              AI Stock Expert
            </span>
            <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 text-xs font-extrabold">
              관리자 전용 통합 관제 센터
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 관리자 마스터 암호 입력 & 동기화 */}
            <div className="flex items-center gap-1.5 bg-[#111927] border border-slate-700 rounded-lg px-2.5 py-1">
              <span className="text-[11px] text-slate-400 font-bold">마스터 암호:</span>
              <input
                type="password"
                placeholder="암호 입력 (기본 h80494)"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') fetchAllAdminData();
                }}
                className="bg-transparent text-white text-xs font-mono outline-none w-32"
              />
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('trading')}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition"
            >
              <span>📡</span>
              <span>계좌·접속 모니터</span>
            </button>

            <button
              type="button"
              onClick={() => fetchAllAdminData()}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-sky-950/90 hover:bg-sky-900 border border-sky-500/60 text-sky-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition"
            >
              <span>🔄</span>
              <span>{isLoading ? '동기화 중...' : '전체 DB 동기화'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition"
            >
              <span>🏠</span>
              <span>메인 화면</span>
            </button>
          </div>
        </div>

        {/* 📊 상단 5대 KPI 요약 카드 그리드 (첨부 이미지와 동일한 레이아웃) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 카드 1: 실시간 접속자 / 활성 세션 */}
          <div className="bg-[#0f1c24] border border-emerald-500/50 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 text-lg shrink-0">
              📞
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">실시간 접속 · 활성 계좌</div>
              <div className="text-xl font-black text-emerald-400 mt-0.5">
                {Math.max(1, tradingOverview.filter((x) => x.account?.is_connected).length)}명 접속중
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                관리자 1명 · 계좌연결 {tradingOverview.filter((x) => x.account?.is_connected).length}계정
              </div>
            </div>
          </div>

          {/* 카드 2: 승인된 정회원 DB */}
          <div className="bg-[#111927] border border-slate-700/80 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300 text-lg shrink-0">
              👥
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">승인된 정회원 DB</div>
              <div className="text-xl font-black text-emerald-400 mt-0.5">
                {approvedUsers.length}명
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                정상 {approvedUsers.length}명 · 차단 {rejectedUsers.length}명
              </div>
            </div>
          </div>

          {/* 카드 3: 승인 대기 신청자 */}
          <div className="bg-[#191711] border border-amber-500/60 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 text-lg shrink-0">
              ⏳
            </div>
            <div>
              <div className="text-[11px] text-amber-200/80 font-semibold">승인 대기 신청자</div>
              <div className="text-xl font-black text-amber-400 mt-0.5">
                {pendingUsers.length}건
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">승인 전까지 접속 불가</div>
            </div>
          </div>

          {/* 카드 4: 누적 가입·문의 신청 DB */}
          <div className="bg-[#111927] border border-slate-700/80 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 text-lg shrink-0">
              🛢️
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">누적 가입·승인 신청 DB</div>
              <div className="text-xl font-black text-sky-400 mt-0.5">{requests.length}건</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                승인완료 {approvedUsers.length}건 · 반려/취소 {rejectedUsers.length}건
              </div>
            </div>
          </div>

          {/* 카드 5: 핵심 트레이딩 메뉴 제한 상태 */}
          <div className="bg-[#161324] border border-purple-500/50 rounded-xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 text-lg shrink-0">
              📢
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">4대 트레이딩 메뉴 제한</div>
              <div className="text-base font-black text-amber-400 mt-0.5">
                {menuPolicy.mode === 'ADMIN_ONLY'
                  ? '관리자 전용 (ON)'
                  : menuPolicy.mode === 'SELECTED_USERS'
                  ? '지정 회원만 허용 (ON)'
                  : '전체 정회원 개방'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                선물·매수·ETF전략·히스토리
              </div>
            </div>
          </div>
        </div>

        {/* ⚖️ 핵심 패널: 4대 핵심 트레이딩 메뉴 이용권한 제어 (3단계 모드) — 첨부 스크린샷과 100% 동일한 구조 */}
        <div className="bg-[#0f1623] border border-red-500/40 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-base">⚖️</span>
              <h4 className="text-sm sm:text-base font-extrabold text-white">
                선물오버나잇자동매매 · 매수주문 · ETF투자전략 · 시뮬레이션히스토리 이용권한 제어 (3단계 모드)
              </h4>
              {menuPolicy.mode === 'ADMIN_ONLY' && (
                <span className="px-3 py-0.5 rounded-full bg-red-950/90 border border-red-500/60 text-red-300 text-xs font-extrabold">
                  🔒 관리자 1인 전용 제한 ON (일반회원 전체 차단중)
                </span>
              )}
              {menuPolicy.mode === 'SELECTED_USERS' && (
                <span className="px-3 py-0.5 rounded-full bg-amber-950/90 border border-amber-500/60 text-amber-300 text-xs font-extrabold">
                  🛡️ 관리자 + 지정 회원만 허용 ON (신규 가입회원 자동 제한)
                </span>
              )}
              {menuPolicy.mode === 'ALL_APPROVED' && (
                <span className="px-3 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-xs font-extrabold">
                  🔓 전체 승인 정회원 이용 허용 중
                </span>
              )}
            </div>

            {/* 우측 3단계 모드 전환 버튼 */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={savingPolicy}
                onClick={() => handleModeChange('ALL_APPROVED')}
                className={`px-3.5 py-2 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 cursor-pointer ${
                  menuPolicy.mode === 'ALL_APPROVED'
                    ? 'bg-emerald-600 border-emerald-300 text-white shadow-lg shadow-emerald-900/50'
                    : 'bg-[#102421] border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/50'
                }`}
              >
                <span>🔓</span>
                <span>전체 승인회원 허용</span>
              </button>

              <button
                type="button"
                disabled={savingPolicy}
                onClick={() => handleModeChange('SELECTED_USERS')}
                className={`px-3.5 py-2 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 cursor-pointer ${
                  menuPolicy.mode === 'SELECTED_USERS'
                    ? 'bg-sky-600 border-sky-300 text-white shadow-lg shadow-sky-900/50'
                    : 'bg-[#112233] border-sky-700/60 text-sky-300 hover:bg-sky-900/50'
                }`}
              >
                <span>👤</span>
                <span>지정 회원만 허용</span>
              </button>

              <button
                type="button"
                disabled={savingPolicy}
                onClick={() => handleModeChange('ADMIN_ONLY')}
                className={`px-3.5 py-2 rounded-lg text-xs font-extrabold border transition flex items-center gap-1.5 cursor-pointer ${
                  menuPolicy.mode === 'ADMIN_ONLY'
                    ? 'bg-rose-600 border-rose-300 text-white shadow-lg shadow-rose-900/50'
                    : 'bg-[#2a1219] border-rose-700/60 text-rose-300 hover:bg-rose-900/50'
                }`}
              >
                <span>🔒</span>
                <span>관리자 1인만 허용</span>
              </button>
            </div>
          </div>

          {/* 제한 안내 메시지 입력 바 */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={menuPolicy.notice_message}
              onChange={(e) => setMenuPolicy({ ...menuPolicy, notice_message: e.target.value })}
              placeholder="제한된 회원이 해당 메뉴를 클릭했을 때 표시할 안내 문구"
              className="flex-1 bg-[#090d16] border border-slate-700/90 rounded-lg px-3.5 py-2 text-xs text-slate-200 outline-none focus:border-sky-500"
            />
            <button
              type="button"
              onClick={() => persistMenuPolicy(menuPolicy, true)}
              disabled={savingPolicy}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold cursor-pointer transition shrink-0"
            >
              {savingPolicy ? '저장 중...' : '💾 안내문구/정책 저장'}
            </button>
          </div>

          {/* 지정 회원 선택 영역 (4대 메뉴 일괄 지정 또는 메뉴별 개별 지정) */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-sky-400 font-extrabold">
                  ⚙️ 4대 핵심 메뉴 열람 지정 회원 선택 ({activeScopeAllowedSet.size}명 지정됨 / 전체 정상회원{' '}
                  {selectableMembers.length}명)
                </span>
                <span className="text-slate-400 text-[11px]">
                  ※ 회원 이름을 클릭하면 즉시 [선물오버나잇 · 매수주문 · ETF투자전략 · 시뮬레이션히스토리] 이용 권한이 ON/OFF 됩니다.
                </span>
              </div>

              {/* 4대 메뉴 통합 지정 vs 개별 메뉴별 지정 탭 */}
              <div className="flex flex-wrap items-center gap-1 bg-[#090d16] border border-slate-800 rounded-lg p-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedMenuScope('ALL_4_MENUS')}
                  className={`px-2.5 py-1 rounded font-extrabold cursor-pointer transition ${
                    selectedMenuScope === 'ALL_4_MENUS'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  4대 메뉴 일괄 지정
                </button>
                {RESTRICTED_MENU_META.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMenuScope(m.id)}
                    className={`px-2 py-1 rounded font-bold cursor-pointer transition ${
                      selectedMenuScope === m.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.shortLabel} ({(menuPolicy.menu_allowed_users?.[m.id] || []).length})
                  </button>
                ))}
              </div>
            </div>

            {/* 회원 칩(Pill) 그리드 */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* 주인장(관리자)는 항상 허용 표시 */}
              <div
                className="px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-400/70 text-emerald-200 text-xs font-extrabold flex items-center gap-1.5 shadow"
                title="관리자(주인장) 계정은 모든 메뉴에 항상 접근 가능합니다."
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                <span className="text-[11px] text-emerald-300">관리자</span>
                <span>주인장(황의춘)</span>
              </div>

              {selectableMembers.length === 0 ? (
                <span className="text-xs text-slate-400 py-1.5">
                  현재 등록된 일반 정회원이 없습니다. 신규 회원이 가입 신청 후 승인되면 이곳에 회원 버튼이 자동으로 표시됩니다.
                </span>
              ) : (
                selectableMembers.map((member) => {
                  const isAllowed = activeScopeAllowedSet.has(member.uid);
                  return (
                    <button
                      key={member.uid}
                      type="button"
                      onClick={() => handleToggleUserPermission(member.uid)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                        isAllowed
                          ? 'bg-sky-950/90 border-sky-400 text-white shadow-md shadow-sky-950/60 ring-1 ring-sky-400/50'
                          : 'bg-[#171f2e] border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full inline-block ${
                          isAllowed ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-400'
                        }`}
                      />
                      <span className="text-[11px] text-slate-400">
                        {isAllowed ? '허용됨' : '미지정'}
                      </span>
                      <span className="font-extrabold">{member.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 알림 메시지 배너 */}
        {msg && (
          <div
            className={`text-xs p-3 rounded-xl border font-bold ${
              msg.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-600 text-emerald-200'
                : 'bg-red-950/70 border-red-600 text-red-200'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* 하단 상세 관리 탭 바 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'requests'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-[#131b2e] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              👥 회원 승인 · 비밀번호 · 메뉴권한 상세 관리 ({requests.length}명)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('trading')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'trading'
                  ? 'bg-cyan-600 text-white shadow-lg'
                  : 'bg-[#131b2e] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              📊 전 회원 개별 계좌 &amp; 트레이딩 감독 ({tradingOverview.length}계정)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-amber-600 text-slate-950 shadow-lg'
                  : 'bg-[#131b2e] text-amber-300 hover:text-white border border-slate-800'
              }`}
            >
              🔐 관리자 마스터 암호 &amp; 이메일 인증(SMTP) 설정
            </button>
          </div>
        </div>

        {/* 탭 1: 신청자 DB 및 회원별 4대 메뉴 권한 테이블 */}
        {activeTab === 'requests' ? (
          <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl bg-[#090d16] min-h-[260px]">
            {isLoading ? (
              <div className="p-12 text-center text-xs text-gray-400 animate-pulse">
                회원 DB 조회 중입니다...
              </div>
            ) : requests.length === 0 ? (
              <div className="p-10 text-center text-xs text-gray-400">
                등록된 회원 신청 내역이 없습니다. (우측 상단에 관리자 마스터 암호를 입력하고 [전체 DB 동기화]를 누르면 상세 비밀번호 관리까지 활성화됩니다.)
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111827] text-slate-300 uppercase font-mono border-b border-slate-800 sticky top-0 backdrop-blur-sm">
                  <tr>
                    <th className="p-2.5">고유ID</th>
                    <th className="p-2.5">로그인 ID</th>
                    <th className="p-2.5">성함</th>
                    <th className="p-2.5">연락처 / 이메일</th>
                    <th className="p-2.5">4대 핵심메뉴 이용권한</th>
                    <th className="p-2.5">비밀번호</th>
                    <th className="p-2.5">신청일시</th>
                    <th className="p-2.5">가입상태</th>
                    <th className="p-2.5 text-center">승인 관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono text-gray-300">
                  {requests.map((req) => {
                    const isPwVisible = !!showPasswordMap[req.id];
                    const isEditingThis = editingId === req.id;
                    const uid = `user_${req.id}`;
                    const isAdminRow =
                      req.id === 1 || (req.email || '').toLowerCase() === 'h80494@gmail.com';
                    const isAllowedUser =
                      isAdminRow ||
                      menuPolicy.mode === 'ALL_APPROVED' ||
                      (menuPolicy.mode === 'SELECTED_USERS' &&
                        (menuPolicy.allowed_user_ids || []).includes(uid));

                    return (
                      <tr key={req.id} className="hover:bg-slate-900/70 transition-colors">
                        <td className="p-2.5 text-slate-400">{isAdminRow ? 'admin' : uid}</td>
                        <td className="p-2.5 font-bold text-purple-300">{req.login_id || req.name}</td>
                        <td className="p-2.5 font-bold text-white">{req.name}</td>
                        <td className="p-2.5 text-slate-300">
                          <div>{req.phone}</div>
                          <div className="text-[10px] text-slate-400">{req.email || '-'}</div>
                        </td>

                        {/* 4대 메뉴 권한 토글 */}
                        <td className="p-2.5 font-sans">
                          {isAdminRow ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-500/60 text-emerald-300 text-[11px] font-extrabold">
                              👑 관리자 (전체 허용)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleUserPermission(uid)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer transition ${
                                isAllowedUser
                                  ? 'bg-sky-950 border-sky-400 text-sky-200'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                              }`}
                            >
                              {isAllowedUser ? '✅ 4대 메뉴 허용됨 (클릭시 제한)' : '🔒 제한됨 (클릭시 허용)'}
                            </button>
                          )}
                        </td>

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
                                {isPwVisible ? req.requested_password || '••••••' : '••••••'}
                              </span>
                              {req.requested_password && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => toggleShowPassword(req.id)}
                                    className="text-[10px] text-gray-400 hover:text-gray-200 px-1 py-0.5 border border-gray-700 rounded"
                                  >
                                    {isPwVisible ? '숨김' : '보기'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(req.id);
                                      setNewPasswordInput(req.requested_password);
                                    }}
                                    className="text-[10px] text-cyan-400 hover:text-cyan-300 px-1 py-0.5 border border-cyan-800 rounded"
                                  >
                                    수정
                                  </button>
                                </>
                              )}
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
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[11px] font-bold transition-all shadow cursor-pointer"
                            >
                              승인
                            </button>
                          )}
                          {req.status !== 'rejected' && (
                            <button
                              onClick={() => handleStatusChange(req.id, 'rejected')}
                              className="bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded text-[11px] font-bold transition-all shadow cursor-pointer"
                            >
                              거절
                            </button>
                          )}
                          {req.status !== 'pending' && (
                            <button
                              onClick={() => handleStatusChange(req.id, 'pending')}
                              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded text-[11px] font-bold transition-all shadow cursor-pointer"
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
        ) : activeTab === 'trading' ? (
          /* 탭 2: 전 회원 개별 증권사 계좌 및 트레이딩 현황 감독 */
          <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl bg-[#090d16] min-h-[260px] p-4 space-y-3">
            {isLoading ? (
              <div className="p-12 text-center text-xs text-gray-400 animate-pulse">
                전 회원 계좌 및 트레이딩 현황 조회 중입니다...
              </div>
            ) : tradingOverview.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-400">
                우측 상단 [마스터 암호]를 입력하고 [전체 DB 동기화] 버튼을 눌러주세요.
              </div>
            ) : (
              tradingOverview.map((item) => {
                const acc = item.account;
                const krHoldings = item.kr_holdings || item.holdings || [];
                const etfHoldings = item.etf_us_holdings || [];
                const totalPnl = Number(item.kr_total_net_pnl ?? item.total_realized_pnl_krw ?? 0);
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
                            acc?.is_connected
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/50'
                              : 'bg-gray-800 text-gray-400 border border-gray-700'
                          }`}
                        >
                          {acc?.is_connected
                            ? `🏦 ${acc.broker_name} [${acc.account_mode}] ${acc.account_display}`
                            : '🔒 증권사 계좌 미연결'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400">
                          국내 실현손익:{' '}
                          <strong className={totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {totalPnl >= 0 ? '+' : ''}
                            {Math.round(totalPnl).toLocaleString()}원
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
                      <div className="bg-black/40 border border-gray-800/80 rounded-lg p-2.5">
                        <div className="font-bold text-gray-300 mb-1.5 flex items-center justify-between">
                          <span>🇰🇷 국내주식 보유종목 ({krHoldings.length}종목)</span>
                        </div>
                        {krHoldings.length === 0 ? (
                          <div className="text-gray-500 text-[11px] py-1">현재 보유 중인 국내 종목 없음</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {krHoldings.map((h) => (
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

                      <div className="bg-black/40 border border-gray-800/80 rounded-lg p-2.5">
                        <div className="font-bold text-gray-300 mb-1.5 flex items-center justify-between">
                          <span>🇺🇸 미국 ETF 보유종목 ({etfHoldings.length}종목)</span>
                          <span className="text-gray-400 font-mono">
                            기본주문: {acc?.etf_order_qty || 100}주 / 자동매매: {acc?.etf_auto_trade ? 'ON' : 'OFF'}
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
        ) : (
          /* 탭 3: 관리자 마스터 비밀번호 변경 & 회원가입 이메일 인증(SMTP) 설정 */
          <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl bg-[#090d16] min-h-[260px] p-5 space-y-5 text-xs">
            <div className="bg-gray-900/80 border border-red-700/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <h4 className="text-sm font-extrabold text-red-400 flex items-center gap-2">
                  <span>👑</span>
                  <span>1. 주인장(관리자) 마스터 비밀번호 변경 (서버 DB 영구 저장)</span>
                </h4>
                <span className="text-[11px] text-gray-400">
                  관리자 로그인 ID: <code className="text-red-300 font-bold">admin</code>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">새 관리자 마스터 비밀번호 *</label>
                  <input
                    type="password"
                    placeholder="새 관리자 암호 (4자리 이상)"
                    value={newAdminMasterPw}
                    onChange={(e) => setNewAdminMasterPw(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">새 관리자 비밀번호 확인 *</label>
                  <input
                    type="password"
                    placeholder="동일하게 재입력"
                    value={confirmAdminMasterPw}
                    onChange={(e) => setConfirmAdminMasterPw(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-red-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleChangeAdminMasterPassword}
                  className="bg-red-600 hover:bg-red-500 text-white font-extrabold py-2 px-4 rounded-lg shadow transition-all cursor-pointer"
                >
                  🔐 관리자 마스터 비밀번호 변경 저장
                </button>
              </div>
            </div>

            <div className="bg-gray-900/80 border border-cyan-700/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <h4 className="text-sm font-extrabold text-cyan-400 flex items-center gap-2">
                  <span>✉️</span>
                  <span>2. 회원가입 이메일 인증번호 발송(SMTP) 설정</span>
                </h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    smtpForm.is_configured
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-amber-950 text-amber-300 border border-amber-700'
                  }`}
                >
                  {smtpForm.is_configured ? '✅ 실제 이메일(SMTP) 발송 활성' : '⚡ 화면 즉시 인증코드 안내 모드'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">SMTP 호스트</label>
                  <input
                    type="text"
                    value={smtpForm.smtp_host}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">SMTP 포트</label>
                  <input
                    type="number"
                    value={smtpForm.smtp_port}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtp_port: Number(e.target.value) || 587 })}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">발신자 표시 이름</label>
                  <input
                    type="text"
                    value={smtpForm.smtp_sender_name}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtp_sender_name: e.target.value })}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">발신 이메일 계정 (SMTP ID)</label>
                  <input
                    type="email"
                    value={smtpForm.smtp_user}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtp_user: e.target.value })}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">이메일 앱 비밀번호</label>
                  <input
                    type="password"
                    value={smtpForm.smtp_password}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtp_password: e.target.value })}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveSmtpConfig}
                  className="bg-cyan-600 hover:bg-cyan-500 text-black font-extrabold py-2 px-4 rounded-lg shadow transition-all cursor-pointer"
                >
                  ✉️ 이메일 인증 SMTP 설정 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
