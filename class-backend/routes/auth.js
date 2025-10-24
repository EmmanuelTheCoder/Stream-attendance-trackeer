const express = require('express');
const auth = express.Router();
const { client } = require('../utils')


const callType = 'default'; 
const callId = 'class_101';

auth.get("/createclass", async (req, res) => {
    
        //create a call
    
        const call = client.video.call(callType, callId)
        const data = {
            created_by_id: "1111",
            custom: {
                classroom_name: "math_101",
                subject: "Mathematics"
            }
            //members: [{ user_id: userId, role: role === "Student" ? "user" : "admin"}],
        }
        
        await call.create({data}) 

})

auth.post("/auth", async (req, res) => {

    try{

        const {fullName, role, userId } = await req.body;
    
        const newUser = {
            id: userId,
            role: role === "Student" ? "user" : "admin",
            custom: {
                full_name: fullName,
                userId: `${role} ${userId}`
            }  
        };
        await client.upsertUsers([newUser]);
        
        const token = await client.generateUserToken({ user_id: userId});
 

        const call = client.video.call(callType, callId);
        await call.updateCallMembers({
            update_members: [{ 
                user_id: userId, 
                role: role === "Student" ? "user" : "admin"
            }]
        });
       

        res.json({token: token, userId: userId, callId: callId, callType: callType })
    }catch(err){
        console.error("Error occurred:", err)
    }


});

module.exports = auth;

