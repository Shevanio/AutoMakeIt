import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { XmlSyntaxEditor } from '@/components/ui/xml-syntax-editor';
import { FileText, AlertTriangle } from 'lucide-react';

interface SpecEditorProps {
  specValue: string;
  improvementsValue: string;
  onSpecChange: (value: string) => void;
  onImprovementsChange: (value: string) => void;
}

export function SpecEditor({
  specValue,
  improvementsValue,
  onSpecChange,
  onImprovementsChange,
}: SpecEditorProps) {
  return (
    <div className="flex-1 p-4 overflow-hidden flex flex-col">
      <Card className="flex-1 flex flex-col overflow-hidden">
        <Tabs defaultValue="spec" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-4 w-auto self-start shrink-0">
            <TabsTrigger value="spec" className="gap-2">
              <FileText className="w-4 h-4" />
              Documentation
            </TabsTrigger>
            <TabsTrigger value="improvements" className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              Improvements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="spec" className="flex-1 m-0 p-4 pt-2 overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0">
              <XmlSyntaxEditor
                value={specValue}
                onChange={onSpecChange}
                placeholder="Write your app specification here..."
                data-testid="spec-editor"
              />
            </div>
          </TabsContent>

          <TabsContent
            value="improvements"
            className="flex-1 m-0 p-4 pt-2 overflow-hidden flex flex-col"
          >
            <div className="flex-1 min-h-0">
              <XmlSyntaxEditor
                value={improvementsValue}
                onChange={onImprovementsChange}
                placeholder="Proposed improvements will appear here after multi-agent analysis..."
                data-testid="improvements-editor"
              />
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
