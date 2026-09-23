-- CreateTable
CREATE TABLE "whatsapp_style_notes" (
    "id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "original" TEXT,
    "fromWaId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_style_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_style_notes_active_createdAt_idx" ON "whatsapp_style_notes"("active", "createdAt");
