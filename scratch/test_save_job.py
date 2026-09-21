
import requests
import json

BASE_URL = "http://localhost:5001"

def test_save_job():
    # 1. Login
    login_data = {
        "username": "testuser2",
        "password": "testpassword"
    }
    print(f"Attempting login for {login_data['username']}...")
    res = requests.post(f"{BASE_URL}/api/v1/auth/login", json=login_data)
    if res.status_code != 200:
        print(f"Login failed, trying signup: {res.status_code}")
        res = requests.post(f"{BASE_URL}/api/v1/auth/signup", json=login_data)
        if res.status_code != 200:
            print(f"Signup failed: {res.status_code} {res.text}")
            return
        print("Signup successful.")

    data = res.json()
    token = data["token"]
    print(f"Login successful. Token: {token[:10]}...")

    # 2. Save job - Test Cases
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    test_urls = [
        "https://www.dice.com/job-detail/test-job-123?searchkw=software&location=remote",
        "https://www.dice.com/job-detail/test-job-123/",
        "https://dice.com/job-detail/test-job-456",
        "https://www.dice.com/job-detail/test-job-456?abc=123"
    ]

    for i, url in enumerate(test_urls):
        job_data = {
            "title": f"Test Job {i}",
            "company": "Test Company",
            "url": url,
            "description": "This is a test job description.",
            "location": "New York, NY",
            "source": "extension"
        }
        print(f"\nAttempting to save job {i}...")
        print(f"URL: {url}")
        res = requests.post(f"{BASE_URL}/api/jobs", json=job_data, headers=headers)
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            print(f"Created: {data.get('created')}")
            print(f"Saved Link: {data.get('job', {}).get('Link')}")
        else:
            print(f"Error: {res.text}")

if __name__ == "__main__":
    test_save_job()
