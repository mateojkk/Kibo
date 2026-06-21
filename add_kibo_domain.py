import sys
sys.path.append("/home/mateo/basement/Kibo/api")
from config import SUPABASE_URL, SUPABASE_KEY
from supabase import create_client

print(f"URL: {SUPABASE_URL}")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
res = supabase.table("users").select("id, username").execute()
for user in res.data:
    if user.get("username") and not user["username"].endswith(".kibo"):
        new_username = user["username"] + ".kibo"
        print(f"Updating {user['username']} to {new_username}")
        supabase.table("users").update({"username": new_username}).eq("id", user["id"]).execute()
print("Done!")
