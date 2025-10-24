import { useState } from 'react'
import './App.css'
import Call from './Call'
import Lobby from './Lobby'
import { UserProvider } from './UserContext'

function App() {
  const [showCall, setShowCall] = useState(false)

  const handleJoinCall = () => setShowCall(true);

  return (
    <UserProvider>
      {showCall ? (
        <Call />
      ) : (
        <Lobby onJoin={handleJoinCall} />
      )}
    </UserProvider>
  )
}

export default App
