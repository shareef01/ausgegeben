import { useState } from 'react';
import { RecordScreen } from './screens/RecordScreen';
import { AddTransactionScreen } from './screens/AddTransactionScreen';

type Screen = 'records' | 'add';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('records');

  return (
    <div className="max-w-md mx-auto min-h-screen bg-background shadow-xl">
      {currentScreen === 'records' && (
        <RecordScreen onAddClick={() => setCurrentScreen('add')} />
      )}

      {currentScreen === 'add' && (
        <AddTransactionScreen onBack={() => setCurrentScreen('records')} />
      )}
    </div>
  );
}

export default App;
