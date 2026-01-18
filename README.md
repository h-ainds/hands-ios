## Hands iOS

**Hands** is your intelligent, personal cooking assistant. Like an AI sous-chef, it helps you get real recipes and meal ideas based on your ingredients and goals.


## Tech Stack

- **Expo** – App tooling & build system  
- **React Native** – Cross-platform mobile framework  
- **Expo Router** – File-based navigation  
- **NativeWind** – Tailwind-style styling for React Native  



## Requirements

- Node.js (LTS recommended)
- npm
- Expo CLI
- Xcode (for iOS Simulator)



# Setup

Install dependencies:

```bash
npm install
```

## Start the development server:
```bash
npx expo start
```

## To run on iOS:
Press i to open in the iOS Simulator
Or scan the QR code with the Expo Go app


# Project Structure
```bash
app/            # Routes and screens (Expo Router)
assets/         # Images, fonts, static files
components/     # Reusable UI components
```

# Git Strategy
main → production-grade, stable code and deploys to App Store (for public releases)

team → internal shared development space, deploying to Testflight (for demos and testing); 

your-new-branch → all new development starts in isolated branches, used for private experimentation or local development before merging upstream

# Contributing

Create your own branch from team and name it after yourself. Make sure you keep this branch up to date when team is updated.
Do all testing and commits in your branch.

Push changes to your branch first, then make a pull request into team for review. Always check if your changes are live and deployed on team.handsfor.com after merging is approved. 



