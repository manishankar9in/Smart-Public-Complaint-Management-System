# Google Maps API Key Setup Guide

## Problem: CORS Error

If you see this error in the console:
```
Access to fetch at 'https://maps.googleapis.com/...' from origin 'http://localhost:5173' has been blocked by CORS policy
```

This means your Google Maps API key doesn't have localhost in the allowed referrers.

## Solution: Add Localhost to API Key Referrers

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Select your project
3. Go to: **APIs & Services** → **Credentials**

### Step 2: Edit Your API Key
1. Find your Google Maps API key
2. Click the **Edit** (pencil) icon
3. Scroll to **Application restrictions**
4. Select **HTTP referrers**
5. Add these referrers:

**For Local Development:**
```
http://localhost:5173/*
http://127.0.0.1:5173/*
```

**For Production (Vercel):**
```
https://your-domain.vercel.app/*
https://*.vercel.app/*
```

### Step 3: Save Changes
1. Click **Save**
2. Wait 1-2 minutes for changes to propagate
3. Refresh your browser
4. Test the autocomplete again

## Alternative: Remove Referrer Restrictions

If you want to test quickly without referrer restrictions:

1. Go to **APIs & Services** → **Credentials**
2. Edit your API key
3. Under **Application restrictions**, select **None**
4. **Warning**: This is less secure. Use only for testing!

## Verify APIs Are Enabled

Make sure these APIs are enabled in Google Cloud Console:

1. **Maps JavaScript API**
2. **Places API** (for autocomplete)
3. **Geocoding API**
4. **Geolocation API**

To check:
1. Go to **APIs & Services** → **Library**
2. Search for each API
3. Click **Enable** if not enabled

## Test Your API Key

After setup, test your API key:

```bash
curl "https://maps.googleapis.com/maps/api/place/autocomplete/json?input=mad&types=geocode&components=country:in&key=YOUR_API_KEY"
```

You should see JSON response with predictions.

## Common Issues

### Issue: "REQUEST_DENIED"
- **Cause**: API key is invalid or restricted
- **Solution**: Check API key restrictions and ensure APIs are enabled

### Issue: "ZERO_RESULTS"
- **Cause**: No results for your search
- **Solution**: Try a different search term

### Issue: CORS Error
- **Cause**: Referrer restrictions block localhost
- **Solution**: Add localhost to referrers (see above)

### Issue: Network Error
- **Cause**: No internet connection or firewall blocking
- **Solution**: Check internet connection and firewall settings

## Security Best Practices

For production deployment:

1. **Use HTTP referrers** to restrict API key usage
2. **Add your production domain** to referrers
3. **Enable API key restrictions** to prevent abuse
4. **Monitor usage** in Google Cloud Console
5. **Set usage limits** to prevent unexpected charges

## Current Status

Your API key is loaded (length: 39 characters).

If autocomplete still fails after following these steps:
1. Check browser console for specific error messages
2. Verify API key is correct
3. Ensure all required APIs are enabled
4. Check referrer restrictions
5. Try removing referrer restrictions temporarily for testing

## Need Help?

If you still have issues:
1. Check Google Cloud Console for API key errors
2. Review billing status (some APIs require billing)
3. Check Google Maps Platform documentation
4. Verify your API key hasn't been revoked
