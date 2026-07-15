import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { c, s, type as t } from '@/lib/theme';
import { Button, Card, IconChip } from '@/lib/components';

type Status = 'loading' | 'noauth' | 'draft' | 'submitted' | 'under_review' | 'rejected' | 'suspended' | 'approved';

export default function Pending() {
  const [status, setStatus] = useState<Status>('loading');
  const [reason, setReason] = useState<string | null>(null);

  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setStatus('noauth');
    const { data: dp } = await supabase.from('driver_profiles').select('status, rejection_reason').eq('driver_id', data.session.user.id).maybeSingle();
    setReason(dp?.rejection_reason ?? null);
    setStatus(((dp?.status as Status) ?? 'draft'));
  }, []);

  useEffect(() => {
    check();
    const poll = setInterval(check, 6000); // auto-advance the moment admin approves
    return () => clearInterval(poll);
  }, [check]);

  if (status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.inkMuted }}>Loading…</Text></View>;
  }
  if (status === 'noauth') return <Redirect href="/login" />;
  if (status === 'approved') return <Redirect href="/" />;

  const gate = {
    draft: { icon: 'document-text-outline' as const, tint: c.brand, title: 'Finish your registration', body: 'Complete identity, licence and police verification to start earning.', cta: 'Continue registration' },
    submitted: { icon: 'hourglass-outline' as const, tint: c.warn, title: 'Under review', body: 'Our team is verifying your documents. You’ll be able to go online once approved — usually within a day.', cta: null },
    under_review: { icon: 'hourglass-outline' as const, tint: c.warn, title: 'Under review', body: 'Our team is verifying your documents. You’ll be able to go online once approved.', cta: null },
    rejected: { icon: 'close-circle-outline' as const, tint: c.danger, title: 'Application rejected', body: reason ?? 'Please review your details and resubmit.', cta: 'Fix and resubmit' },
    suspended: { icon: 'ban-outline' as const, tint: c.danger, title: 'Account suspended', body: reason ?? 'Contact Acting support for help.', cta: null },
  }[status];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', padding: s.xl }}>
      <Card>
        <View style={{ alignItems: 'center', gap: s.md, paddingVertical: s.md }}>
          <IconChip icon={gate.icon} tint={gate.tint} />
          <Text style={[t.h1, { color: c.ink, textAlign: 'center' }]}>{gate.title}</Text>
          <Text style={[t.body, { color: c.inkMuted, textAlign: 'center', lineHeight: 22 }]}>{gate.body}</Text>
          {gate.cta && <Button label={gate.cta} icon="arrow-forward" onPress={() => router.push('/register')} style={{ alignSelf: 'stretch', marginTop: s.sm }} />}
        </View>
      </Card>
      <Pressable onPress={async () => { await supabase.auth.signOut(); router.replace('/login'); }} style={{ marginTop: s.xl }}>
        <Text style={{ color: c.inkFaint, textAlign: 'center', fontWeight: '600' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
