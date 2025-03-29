import aquaImage from './avatars/aqua.png';  
import meguminImage from './avatars/megumin.png';

export const getProfilePhoto = async (instance, activeAccount) => {
  if (!activeAccount) return null;
  
  try {
    // Choose image based on user role
    const isAdmin = activeAccount.idTokenClaims?.roles?.includes('Admin');
    
    // Path to the image file
    return isAdmin ? aquaImage : meguminImage;
    
  } catch (error) {
    console.error('Error with mock profile photo:', error);
    return null;
  }
};

// Mock implementation for Microsoft Graph API calls

// Mock data for groups
const mockGroups = [
  {
    id: "16825e98-2e8a-408b-a4ca-a1a96814a714",
    displayName: "Engineering Team",
    description: "All engineering staff",
    mailNickname: "engineering",
    mail: "engineering@contoso.com",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-07-15T09:23:18Z",
    renewedDateTime: "2023-07-15T09:23:18Z"
  },
  {
    id: "4a721a8a-5a20-4402-8d1f-7761910c6d21",
    displayName: "Marketing Department",
    description: "Marketing strategy and execution team",
    mailNickname: "marketing",
    mail: "marketing@contoso.com",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-05-22T14:12:47Z",
    renewedDateTime: "2023-05-22T14:12:47Z"
  },
  {
    id: "7c32a742-f204-4bc2-ae29-4523762b75ec",
    displayName: "Executive Committee",
    description: "Company leadership and decision makers",
    mailNickname: "execs",
    mail: "executives@contoso.com",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-01-05T08:45:33Z",
    renewedDateTime: "2023-01-05T08:45:33Z"
  },
  {
    id: "3d21b8a1-e32c-469a-b8c1-a094c98f1ac9",
    displayName: "All Employees",
    description: "Group containing all current employees",
    mailNickname: "all-staff",
    mail: "all-staff@contoso.com",
    visibility: "Public",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2022-12-15T10:30:22Z",
    renewedDateTime: "2022-12-15T10:30:22Z"
  },
  {
    id: "c58a9c1d-7fb4-4aa2-86b8-94d45e912c47",
    displayName: "Project Crimson",
    description: "Special project team for Project Crimson",
    mailNickname: "project-crimson",
    mail: "project-crimson@contoso.com",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-09-08T11:21:45Z",
    renewedDateTime: "2023-09-08T11:21:45Z"
  }
];

// Admin-only groups (additional groups for admin users)
const adminGroups = [
  {
    id: "9e5a7b32-c8d1-40e6-b3f2-a452e6d8790c",
    displayName: "Global Administrators",
    description: "Members can manage all aspects of Azure AD and Microsoft services",
    mailNickname: "global-admins",
    mail: "global-admins@contoso.com",
    visibility: "Private",
    groupTypes: [],
    securityEnabled: true,
    mailEnabled: false,
    createdDateTime: "2022-11-01T08:15:30Z",
    renewedDateTime: "2022-11-01T08:15:30Z"
  },
  {
    id: "5d8a2c31-e6f7-49b0-a7d2-8c36e4a91b5d",
    displayName: "Security Operations",
    description: "IT Security team responsible for security operations",
    mailNickname: "secops",
    mail: "security-ops@contoso.com",
    visibility: "Private",
    groupTypes: ["Unified"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2022-12-10T13:45:22Z",
    renewedDateTime: "2022-12-10T13:45:22Z"
  },
  {
    id: "a7f44e1c-2d63-48b5-9e1a-fc3b8d721e0b",
    displayName: "Axis Cult Divine Administration",
    description: "The sacred team of goddess souls with divine purification privileges",
    mailNickname: "axis-divine-admin",
    mail: "axis-admin@contoso.com",
    visibility: "Private",
    groupTypes: ["DynamicMembership"],
    securityEnabled: true,
    mailEnabled: true,
    createdDateTime: "2023-03-18T12:30:45Z",
    renewedDateTime: "2023-03-18T12:30:45Z"
  }
];

const getAllGroups = async (instance) => {
  const isAdmin = instance.accounts[0].idTokenClaims?.roles?.includes('Admin');
  console.log('Using mock getAllGroups');
  return isAdmin ? [...mockGroups, ...adminGroups] : mockGroups;
};

const mockGraphApi = (role) => {
  if (!role) { return; }
  console.log(`Mocking API calls`);
  window.getProfilePhoto = getProfilePhoto;

  window.getAllGroups = getAllGroups;
  
}

export default mockGraphApi;