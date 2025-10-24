import { useState } from 'react';
import './App.css';
import { useUser } from './UserContext';

const Lobby = ({ onJoin }) => {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Student');
  const [userId, setUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setUser } = useUser();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fullName.trim()) {
      alert('Please enter your full name');
      return;
    }

    if (!userId.trim()) {
      alert(`Please enter your ${role === 'Student' ? 'student' : 'teacher'} ID`);
      return;
    }

    if (!/^\d+$/.test(userId)) {
      alert('ID must contain numbers only');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        fullName,
        role,
        userId
      };

      const response = await fetch('https://979b621eadd7.ngrok-free.app/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log("data from backend", data)

      // Store the user data with token, id, and type
      setUser({
        token: data.token,
        id: data.userId,
        callType: data.callType,
        callId: data.callId
      });

      // Navigate to Call component
      onJoin();
    } catch (error) {
      console.error('Authentication error:', error);
      alert(`Failed to authenticate: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="lobby">
      <h1>Join Classroom</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="fullName">Full Name</label>
          <input
            type="text"
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter your full name"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="role">Role</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          >
            <option value="Student">Student</option>
            <option value="Teacher">Teacher</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="userId">
            {role === 'Student' ? 'Student ID' : 'Teacher ID'}
          </label>
          <input
            type="text"
            id="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={`Enter your ${role === 'Student' ? 'student' : 'teacher'} ID (numbers only)`}
            pattern="\d+"
            required
          />
        </div>

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Joining...' : 'Join Call'}
        </button>
      </form>
    </div>
  );
};

export default Lobby;
