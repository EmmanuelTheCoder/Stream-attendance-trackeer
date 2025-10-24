## Automated Attendance Tracker 

#### This project demonstrates how to automatically track attendance(leave, join, participation, etc) on a Classroom call created by Stream. At the end of the call session, a detailed description of the class including attendance of each participant, contribution and imporovement is sent to the teacher's email.
#### The project uses the following tech to do what it does:
* [Stream](https://getstream.io) to create classroom/call
* Supabase to store participant and call information.
* OpenAI to generate detailed class report at the end of each call.
* PDFkit to convert the generated report into a PDF
* Resend to email class report to teacher (with PDF attached) at the end of each class. 
