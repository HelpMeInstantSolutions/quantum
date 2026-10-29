/**
 * Helper to get default avatar URL based on gender and role
 */
function getAvatar(avatarUrl, gender = 'Male', role = 'student') {
    // If a custom photo/avatar is already uploaded (and not the old static placeholder)
    if (avatarUrl && 
        avatarUrl !== '/images/default_student.png' && 
        avatarUrl !== '/images/default_avatar.png' && 
        avatarUrl !== '' && 
        !avatarUrl.includes('default_')) {
        return avatarUrl;
    }

    const isFemale = (gender || '').toLowerCase() === 'female';

    if (role === 'student') {
        return isFemale ? '/images/default_student_female.svg' : '/images/default_student_male.svg';
    }

    if (role === 'teacher') {
        return isFemale ? '/images/default_teacher_female.svg' : '/images/default_teacher_male.svg';
    }

    // Admin, Parent, or General User
    return isFemale ? '/images/default_avatar_female.svg' : '/images/default_avatar_male.svg';
}

module.exports = { getAvatar };
