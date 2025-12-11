import { redirect } from "next/navigation"

export default async function KeyPage({ params }: { params: Promise<{ keyId: string }> }) {
  const { keyId } = await params
  redirect(`/keys/${keyId}/settings`)
}
