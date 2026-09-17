import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createMessageSchema } from '@/lib/validation/jobs';
import { notify } from '@/lib/services/notifications';

/**
 * Chat for one job. RLS (`can_chat_on_job`) limits both reads and writes to the
 * customer and the assigned provider, so no filtering is needed here.
 */
export const GET = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { supabase } = await requireSession();

  const { data, error } = await supabase
    .from('messages')
    .select('id, job_id, sender_id, body, message_type, storage_path, read_at, created_at')
    .eq('job_id', id)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) throw ApiError.badRequest('לא ניתן לטעון הודעות', error.message);
  return jsonOk({ messages: data ?? [] });
});

export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  checkRateLimit(`messages:${session.userId}`, RATE_LIMITS.sendMessage);

  const input = await parseBody(request, createMessageSchema);

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      job_id: id,
      sender_id: session.userId,
      body: input.body ?? null,
      message_type: input.messageType,
      storage_path: input.storagePath ?? null,
    })
    .select()
    .single();

  if (error || !message) {
    throw ApiError.forbidden('לא ניתן לשלוח הודעה בעבודה הזו');
  }

  const admin = requireServiceClient();
  const { data: job } = await admin
    .from('jobs')
    .select('customer_id, assigned_provider_id')
    .eq('id', id)
    .maybeSingle();

  if (job) {
    let recipientId: string | null = null;
    if (job.customer_id === session.userId && job.assigned_provider_id) {
      const { data: provider } = await admin
        .from('provider_profiles')
        .select('user_id')
        .eq('id', job.assigned_provider_id)
        .maybeSingle();
      recipientId = provider?.user_id ?? null;
    } else {
      recipientId = job.customer_id;
    }

    if (recipientId && recipientId !== session.userId) {
      const { data: contact } = await admin
        .from('users')
        .select('id, email, phone')
        .eq('id', recipientId)
        .maybeSingle();

      if (contact) {
        await notify({
          event: 'new_message',
          recipient: { userId: contact.id, email: contact.email, phone: contact.phone },
          jobId: id,
          url: job.customer_id === recipientId ? `/app/messages/${id}` : `/provider/messages/${id}`,
          template: { customerName: session.fullName, providerName: session.fullName },
          client: admin,
        });
      }
    }
  }

  return jsonOk({ message }, 201);
});
