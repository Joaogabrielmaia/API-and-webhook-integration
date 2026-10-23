-- Dois clientes do CRM com o mesmo CNPJ apontam para o mesmo cliente do ERP (RN-02).
-- Por isso o CNPJ deixa de ser único no vínculo; a unicidade fica no ERP.

-- DropIndex
DROP INDEX "CustomerLink_taxId_key";

-- CreateIndex
CREATE INDEX "CustomerLink_taxId_idx" ON "CustomerLink"("taxId");
