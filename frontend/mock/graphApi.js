export const getProfilePhoto = async (instance, activeAccount) => {
  if (!activeAccount) return null;
  
  try {
    // Get the user's profile ID from their account
    const profileId = activeAccount.localAccountId;
    
    // Create dynamic import for the avatar based on profile ID
    try {
      // Dynamically import the image based on profile ID
      const avatarModule = await import(`./avatars/${profileId}.png`);
      return avatarModule.default;
    } catch (importError) {
      console.warn(`No profile image found for ID: ${profileId}, using default`);
      
      // Fallback to role-based default if specific avatar not found
      const isAdmin = activeAccount.idTokenClaims?.roles?.includes('Admin');
      const defaultModule = await import(`./avatars/${isAdmin ? 'admin' : 'user'}-default.png`);
      return defaultModule.default;
    }
  } catch (error) {
    console.error('Error loading profile photo:', error);
    return null;
  }
};

// Mock implementation for Microsoft Graph API calls

// Mock data for groups
const userGroups = [
  {
    id: "16825e98-2e8a-408b-a4ca-a1a96814a714",
    displayName: "Future Gadget Laboratory",
    description: "Official research group for the development of future gadgets",
    mailNickname: "lab-members",
    mail: "lab-members@futuregadgetlab.org",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-07-15T09:23:18Z",
    renewedDateTime: "2023-07-15T09:23:18Z"
  },
  {
    id: "4a721a8a-5a20-4402-8d1f-7761910c6d21",
    displayName: "Operation Skuld",
    description: "Special project team for reaching Steins;Gate worldline",
    mailNickname: "skuld",
    mail: "operation-skuld@futuregadgetlab.org",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-05-22T14:12:47Z",
    renewedDateTime: "2023-05-22T14:12:47Z"
  },
  {
    id: "7c32a742-f204-4bc2-ae29-4523762b75ec",
    displayName: "Time Travel Research",
    description: "Researchers investigating theoretical physics of time travel",
    mailNickname: "timetravel",
    mail: "timetravel@futuregadgetlab.org",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-01-05T08:45:33Z",
    renewedDateTime: "2023-01-05T08:45:33Z"
  }
];

// Admin-only groups - SERN and Committee of 300
const adminGroups = [
  {
    id: "9e5a7b32-c8d1-40e6-b3f2-a452e6d8790c",
    displayName: "Committee of 300",
    description: "Secret organization controlling global politics and scientific development",
    mailNickname: "committee300",
    mail: "committee@sern.eu",
    visibility: "Private",
    groupTypes: [],
    securityEnabled: true,
    mailEnabled: false,
    createdDateTime: "2022-11-01T08:15:30Z",
    renewedDateTime: "2022-11-01T08:15:30Z"
  },
  {
    id: "5d8a2c31-e6f7-49b0-a7d2-8c36e4a91b5d",
    displayName: "SERN Z-Program",
    description: "Top-secret time travel research division within SERN",
    mailNickname: "z-program",
    mail: "zprogram@sern.eu",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2022-12-10T13:45:22Z",
    renewedDateTime: "2022-12-10T13:45:22Z"
  },
  {
    id: "a7f44e1c-2d63-48b5-9e1a-fc3b8d721e0b",
    displayName: "Jellyman Research Team",
    description: "SERN research group studying human teleportation and jellification",
    mailNickname: "jellyman",
    mail: "jellyman@sern.eu",
    visibility: "Private",
    groupTypes: ["DynamicMembership"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-03-18T12:30:45Z",
    renewedDateTime: "2023-03-18T12:30:45Z"
  },
  {
    id: "b8e23f9d-1a74-42c5-9f3e-6d821a093c57",
    displayName: "Rounders",
    description: "SERN's special operations unit for securing critical assets and eliminating threats",
    mailNickname: "rounders",
    mail: "rounders@sern.eu",
    visibility: "Private",
    groupTypes: [],
    securityEnabled: true,
    mailEnabled: false,
    createdDateTime: "2022-10-15T07:30:10Z",
    renewedDateTime: "2022-10-15T07:30:10Z"
  },
  {
    id: "c6d37e18-5f12-4a98-b742-3e91ba5f8e24",
    displayName: "IBN Tactical Unit",
    description: "Team responsible for locating and securing IBN 5100 computers worldwide",
    mailNickname: "ibn-tactical",
    mail: "ibntactical@sern.eu",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-02-05T09:15:22Z",
    renewedDateTime: "2023-02-05T09:15:22Z"
  }
];

export const getAllGroups = async (instance) => {
  const isAdmin = instance.getActiveAccount()?.idTokenClaims?.roles?.includes('Admin');
  console.log('Using mock getAllGroups');
  return isAdmin ? [...userGroups, ...adminGroups] : userGroups;
};