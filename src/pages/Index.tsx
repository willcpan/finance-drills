
import { Toaster } from "sonner";
import GameContainer from "@/components/GameContainer";
import { Calculator, TrendingUp, DollarSign } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-finance-light-gray">
      <Toaster position="top-right" />
      
      <header className="bg-finance-blue text-white py-4 shadow-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calculator className="h-6 w-6" />
              <h1 className="text-xl font-bold">Finance Drills</h1>
            </div>
            <div className="flex items-center space-x-4">
              <TrendingUp className="h-5 w-5" />
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto py-8 px-4">
        <GameContainer />
      </main>
      
      <footer className="bg-white py-4 border-t">
        <div className="container mx-auto px-4">
          <p className="text-center text-gray-500 text-sm">
            Finance Drills © {new Date().getFullYear()} | Real company figures, derived prior
            closes. For practice, not investment advice.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
