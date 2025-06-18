import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, deleteDoc } from 'firebase/firestore';

// Define constants for the IDP capital management game
const NUM_TABLES = 2; // Fixed number of tables
const INTEREST_PAID_BY_RECEIVER_PER_OTHER_MEMBER = 100000; // 100,000 VND

// Helper function to remove Vietnamese accents
const removeVietnameseAccents = (str) => {
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str.toLowerCase(); // Convert to lower case
};

// Create a context for Firebase services
const FirebaseContext = createContext(null);

// Firebase Provider component to initialize Firebase and provide services
const FirebaseProvider = ({ children }) => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initFirebase = async () => {
            try {
                const firebaseConfig = JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG);
                const app = initializeApp(firebaseConfig);
                const dbInstance = getFirestore(app);
                const authInstance = getAuth(app);

                setDb(dbInstance);
                setAuth(authInstance);

                onAuthStateChanged(authInstance, async (user) => {
                    if (user) {
                        setUserId(user.uid);
                    } else {
                        try {
                            await signInAnonymously(authInstance);
                        } catch (error) {
                            console.error("Firebase Auth Error:", error);
                            setUserId(crypto.randomUUID());
                        }
                    }
                    setLoading(false);
                });
            } catch (error) {
                console.error("Firebase initialization error:", error);
                setUserId(crypto.randomUUID());
                setLoading(false);
            }
        };

        initFirebase();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-xl font-semibold text-gray-700">Đang tải ứng dụng quản lý quỹ...</div>
            </div>
        );
    }

    return (
        <FirebaseContext.Provider value={{ db, auth, userId }}>
            {children}
        </FirebaseContext.Provider>
    );
};

// Custom hook to use Firebase services
const useFirebase = () => useContext(FirebaseContext);

// Main Application Component
const App = () => {
    const { db, userId } = useFirebase();
    const [allFunds, setAllFunds] = useState([]); // All funds fetched from Firestore
    const [currentFundId, setCurrentFundId] = useState(null); // ID of the currently active fund
    const [currentFund, setCurrentFund] = useState(null); // The currently active fund object
    const [message, setMessage] = useState('');
    const [loadingData, setLoadingData] = useState(true);

    // Initial form states for creating a new fund
    const [newFundName, setNewFundName] = useState('');
    const [initialBaseContribution, setInitialBaseContribution] = useState(500000); 
    const [numMembersTotal, setNumMembersTotal] = useState(20);
    const [startDate, setStartDate] = useState(''); 
    const [durationInMonths, setDurationInMonths] = useState(1); 
    const [calculatedEndDate, setCalculatedEndDate] = useState('');   
    const [monthlyWithdrawalDay, setMonthlyWithdrawalDay] = useState(1); 

    const [timeRemainingDisplay, setTimeRemainingDisplay] = useState('N/A'); 
    const [monthlyReminderMessage, setMonthlyReminderMessage] = useState(''); 
    const [showAllTablesManualWithdrawalModal, setShowAllTablesManualWithdrawalModal] = useState(false);

    // State for modal to create/select fund
    const [showFundSelectionModal, setShowFundSelectionModal] = useState(false);

    // Ref for the content to be exported as image
    const exportContentRef = useRef(null);

    // Get the app ID from the global variable
    const appId = process.env.REACT_APP_ID || 'default-app-id';
    // Base path for funds collection
    const fundsCollectionPath = `artifacts/${appId}/public/data/funds`;

    // Effect to dynamically load html2canvas
    useEffect(() => {
        if (typeof window.html2canvas === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
            script.onload = () => { console.log('html2canvas loaded successfully!'); };
            script.onerror = () => {
                console.error('Failed to load html2canvas.');
                setMessage('Lỗi: Không thể tải thư viện html2canvas. Vui lòng kiểm tra kết nối mạng.');
            };
            document.body.appendChild(script);
        }
    }, []);

    // Effect to calculate endDate based on startDate and durationInMonths for new fund creation form
    useEffect(() => {
        if (startDate && durationInMonths >= 1) {
            const start = new Date(startDate);
            const end = new Date(start.getFullYear(), start.getMonth() + durationInMonths, start.getDate());
            const tempEnd = new Date(start.getFullYear(), start.getMonth() + durationInMonths + 1, 0);
            if (start.getDate() > tempEnd.getDate()) {
                end.setDate(tempEnd.getDate());
            }
            setCalculatedEndDate(end.toISOString().split('T')[0]);
        } else {
            setCalculatedEndDate('');
        }
    }, [startDate, durationInMonths]);

    // Effect to listen for all funds and manage the currentFundId
    useEffect(() => {
        if (!db || !userId) return;

        const q = query(collection(db, fundsCollectionPath));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedFunds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllFunds(fetchedFunds);
            setLoadingData(false);

            // If no fund is currently selected, try to select the first active one
            if (!currentFundId && fetchedFunds.length > 0) {
                const activeFund = fetchedFunds.find(fund => fund.status === 'active');
                if (activeFund) {
                    setCurrentFundId(activeFund.id);
                } else {
                    // If no active fund, and user just initialized, select the first one.
                    // Or, if there are funds but none are 'active', prompt to create/select.
                    setCurrentFundId(fetchedFunds[0]?.id || null);
                }
            } else if (currentFundId && !fetchedFunds.some(f => f.id === currentFundId)) {
                // If the currentFundId is no longer in fetchedFunds (e.g., deleted), reset it
                setCurrentFundId(fetchedFunds.find(fund => fund.status === 'active')?.id || null);
            }
        }, (error) => {
            console.error("Error fetching funds:", error);
            setMessage(`Lỗi khi tải dữ liệu quỹ: ${error.message}`);
            setLoadingData(false);
        });

        return () => unsubscribe();
    }, [db, userId, appId, fundsCollectionPath, currentFundId]); // currentFundId as dependency to re-evaluate current fund selection

    // Effect to set the currentFund object based on currentFundId
    useEffect(() => {
        if (currentFundId && allFunds.length > 0) {
            const foundFund = allFunds.find(fund => fund.id === currentFundId);
            setCurrentFund(foundFund || null);
            if (foundFund) {
                // Update new fund form states with selected fund's details for display/re-initialization context
                setNewFundName(foundFund.name);
                setInitialBaseContribution(foundFund.initialBaseContribution);
                setNumMembersTotal(foundFund.numMembersTotal);
                setStartDate(foundFund.startDate);
                setDurationInMonths(foundFund.durationInMonths);
                setMonthlyWithdrawalDay(foundFund.monthlyWithdrawalDay);
            }
        } else {
            setCurrentFund(null);
            // Reset form states if no fund selected
            setNewFundName('');
            setInitialBaseContribution(500000);
            setNumMembersTotal(20);
            setStartDate('');
            setDurationInMonths(1);
            setMonthlyWithdrawalDay(1);
        }
    }, [currentFundId, allFunds]);

    // Effect to calculate and update time remaining (in months) and monthly reminder for the dashboard
    useEffect(() => {
        let intervalId;
        if (currentFund && currentFund.startDate && currentFund.endDate) {
            const calculateAndRemind = () => {
                const end = new Date(currentFund.endDate);
                const now = new Date();

                if (now > end) {
                    setTimeRemainingDisplay('Đã kết thúc');
                } else {
                    const yearDiff = end.getFullYear() - now.getFullYear();
                    const monthDiff = end.getMonth() - now.getMonth();
                    let totalMonthsRemaining = yearDiff * 12 + monthDiff;

                    if (now.getDate() > end.getDate()) {
                        totalMonthsRemaining--;
                    }

                    if (totalMonthsRemaining <= 0) {
                        setTimeRemainingDisplay('Đã kết thúc');
                    } else {
                        setTimeRemainingDisplay(`${totalMonthsRemaining} tháng`);
                    }
                }

                const currentDayOfMonth = now.getDate();
                const storedWithdrawalDay = currentFund.monthlyWithdrawalDay;
                if (storedWithdrawalDay && currentDayOfMonth === storedWithdrawalDay) {
                    setMonthlyReminderMessage(`HÔM NAY LÀ NGÀY ${storedWithdrawalDay} HÀNG THÁNG! NGÀY RÚT QUỸ ĐÃ ĐẾN.`);
                } else {
                    setMonthlyReminderMessage('');
                }
            };

            calculateAndRemind();
            intervalId = setInterval(calculateAndRemind, 1000); 
        } else {
            setTimeRemainingDisplay('Chưa có thông tin ngày');
            setMonthlyReminderMessage('');
            if (intervalId) clearInterval(intervalId);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [currentFund]);

    // Function to initialize a new IDP capital fund
    const createNewFund = async () => {
        if (!db || !userId) {
            setMessage('Lỗi: Firebase chưa sẵn sàng. Vui lòng thử lại.');
            return;
        }

        // Validate inputs for new fund
        if (!newFundName.trim()) {
            setMessage('Lỗi: Tên quỹ không được để trống.');
            return;
        }
        if (isNaN(initialBaseContribution) || initialBaseContribution <= 0) {
            setMessage('Lỗi: Số tiền góp quỹ gốc phải là một số dương.');
            return;
        }
        if (isNaN(numMembersTotal) || numMembersTotal <= 0 || numMembersTotal % NUM_TABLES !== 0) {
            setMessage(`Lỗi: Tổng số người chơi phải là số dương và chia hết cho ${NUM_TABLES} (số bảng).`);
            return;
        }
        if (!startDate) {
            setMessage('Lỗi: Vui lòng chọn ngày bắt đầu chơi.');
            return;
        }
        if (!calculatedEndDate) {
            setMessage('Lỗi: Ngày kết thúc không hợp lệ. Vui lòng kiểm tra ngày bắt đầu và thời gian chơi.');
            return;
        }
        const startDateTime = new Date(startDate);
        const endDateTime = new Date(calculatedEndDate);
        if (startDateTime >= endDateTime) {
            setMessage('Lỗi: Ngày kết thúc phải sau ngày bắt đầu. Vui lòng kiểm tra thời gian chơi.');
            return;
        }
        if (isNaN(monthlyWithdrawalDay) || monthlyWithdrawalDay < 1 || monthlyWithdrawalDay > 31) {
            setMessage('Lỗi: Ngày rút quỹ hàng tháng phải là một số từ 1 đến 31.');
            return;
        }

        const membersPerTable = numMembersTotal / NUM_TABLES;
        const fundId = doc(collection(db, fundsCollectionPath)).id; // Generate new ID for the fund

        try {
            const newTables = [];
            for (let i = 1; i <= NUM_TABLES; i++) {
                const tableName = `Bảng ${i}`;
                const members = Array.from({ length: membersPerTable }, (_, j) => ({
                    id: `member${i}-${j + 1}`,
                    name: `Người ${j + 1}`, 
                    bankAccountNumber: '',
                    bankName: '',
                    hasReceivedPot: false,
                    tableId: `table${i}`, // This tableId is local to the fund
                }));

                newTables.push({
                    id: `table${i}`,
                    name: tableName,
                    baseContribution: initialBaseContribution,
                    interestPerOtherMember: INTEREST_PAID_BY_RECEIVER_PER_OTHER_MEMBER,
                    members: members,
                    rounds: [],
                    nextRoundNumber: 1,
                    membersPerTable: membersPerTable, 
                });
            }

            const fundData = {
                name: newFundName.trim(),
                status: 'active', // New fund is active by default
                initialBaseContribution: initialBaseContribution,
                numMembersTotal: numMembersTotal,
                startDate: startDate,
                endDate: calculatedEndDate,
                monthlyWithdrawalDay: monthlyWithdrawalDay,
                durationInMonths: durationInMonths,
                interestPerOtherMember: INTEREST_PAID_BY_RECEIVER_PER_OTHER_MEMBER,
                membersPerTable: membersPerTable,
                tables: newTables, // Store tables as an array within the fund document
                createdAt: new Date().toISOString(),
                createdBy: userId,
            };

            await setDoc(doc(db, fundsCollectionPath, fundId), fundData);
            setCurrentFundId(fundId); // Set the newly created fund as current
            setMessage(`Đã khởi tạo quỹ "${newFundName}" thành công!`);
            setShowFundSelectionModal(false); // Close modal
        } catch (error) {
            console.error("Error creating new fund:", error);
            setMessage(`Lỗi khi khởi tạo quỹ: ${error.message}`);
        }
    };

    // Calculate overall statistics for the dashboard of the current fund
    const totalRegisteredMembers = currentFund?.tables?.reduce((acc, table) => acc + table.members.length, 0) || 0;
    const totalWithdrawnMembers = currentFund?.tables?.reduce((acc, table) => 
        acc + table.members.filter(member => member.hasReceivedPot).length, 0
    ) || 0;
    const totalRemainingMembers = totalRegisteredMembers - totalWithdrawnMembers;

    // Function to handle exporting withdrawn members list to PNG
    const exportWithdrawnMembersToPNG = async () => { 
        if (typeof window.html2canvas === 'undefined') {
            setMessage('Lỗi: Thư viện html2canvas chưa được tải. Vui lòng thử lại sau giây lát hoặc kiểm tra kết nối mạng.');
            return;
        }
        if (!exportContentRef.current) {
            setMessage('Lỗi: Không tìm thấy nội dung để xuất.');
            return;
        }
        if (!currentFund) {
            setMessage('Vui lòng chọn một quỹ để xuất danh sách.');
            return;
        }

        const now = new Date();
        const currentMonth = now.getMonth(); // 0-indexed
        const currentYear = now.getFullYear();
        const exportDay = 25; // Specific day for export filter

        // Collect all rounds from the current fund's tables
        const allRounds = currentFund.tables.flatMap(table => table.rounds);

        // Filter rounds that occurred on the 25th of the current month and year
        const roundsThisMonthOn25th = allRounds.filter(round => {
            const roundDate = new Date(round.date);
            return roundDate.getDate() === exportDay && roundDate.getMonth() === currentMonth && roundDate.getFullYear() === currentYear;
        });

        // Get unique receivers from these rounds, ensuring we have their latest member details
        const withdrawnMembersThisMonthOn25th = [];
        const addedMemberIds = new Set();

        roundsThisMonthOn25th.forEach(round => {
            const tableForRound = currentFund.tables.find(t => t.id === round.tableId); // Correctly find table by tableId
            if (tableForRound) {
                const memberDetails = tableForRound.members.find(m => m.id === round.receiverId);
                if (memberDetails && !addedMemberIds.has(memberDetails.id)) {
                    withdrawnMembersThisMonthOn25th.push(memberDetails);
                    addedMemberIds.add(memberDetails.id);
                }
            }
        });

        if (withdrawnMembersThisMonthOn25th.length === 0) {
            setMessage(`Quỹ "${currentFund.name}": Chưa có thành viên nào rút quỹ vào ngày ${exportDay} tháng ${currentMonth + 1}/${currentYear} để xuất danh sách.`);
            return;
        }

        // Sort by name for consistent output
        withdrawnMembersThisMonthOn25th.sort((a, b) => a.name.localeCompare(b.name));

        setMessage('Đang tạo ảnh PNG...');

        // Dynamically create a div to hold the content for the image
        const exportDiv = document.createElement('div');
        exportDiv.style.padding = '20px';
        exportDiv.style.backgroundColor = '#ffffff';
        exportDiv.style.fontFamily = 'Inter, sans-serif';
        exportDiv.style.color = '#333';
        exportDiv.style.width = 'fit-content';
        exportDiv.style.maxWidth = '800px';

        let contentHtml = `
            <h2 style="font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 20px; color: #4A5568;">
                Danh sách Thành viên Đã rút Quỹ Ngày ${exportDay} Tháng ${currentMonth + 1}/${currentYear}<br/>
                <span style="font-size: 18px; font-weight: normal; color: #6B7280;">Quỹ: ${currentFund.name}</span>
            </h2>
            <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 20px;">
        `;

        withdrawnMembersThisMonthOn25th.forEach(member => {
            contentHtml += `
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background-color: #f7fafc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 280px;">
                    <p style="font-weight: bold; font-size: 18px; margin-bottom: 5px; color: #2D3748;">${member.name}</p>
                    <p style="font-size: 14px; color: #4A5568;">STK: <span style="font-weight: 600;">${member.bankAccountNumber || 'Chưa có'}</span></p>
                    <p style="font-size: 14px; color: #4A5568;">Ngân hàng: <span style="font-weight: 600;">${member.bankName || 'Chưa có'}</span></p>
            `;
            if (member.bankAccountNumber) {
                const qrData = `STK:${member.bankAccountNumber}, NH:${member.bankName || 'Khong ro'}, ChuTK:${removeVietnameseAccents(member.name)}`;
                contentHtml += `
                    <div style="text-align: center; margin-top: 10px;">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}" 
                             alt="Mã QR cho ${member.bankAccountNumber}" 
                             style="width: 120px; height: 120px; border-radius: 4px; border: 1px solid #cbd5e0;"/>
                    </div>
                `;
            }
            contentHtml += `</div>`;
        });

        contentHtml += `</div>`;
        exportDiv.innerHTML = contentHtml;

        document.body.appendChild(exportDiv);

        try {
            const canvas = await window.html2canvas(exportDiv, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: null,
            });

            const image = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = image;
            link.download = `Danh_sach_rut_quy_IDP_${currentFund.name}_Ngay_${exportDay}_Thang_${currentMonth + 1}_${currentYear}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setMessage('Đã xuất danh sách ra ảnh PNG thành công!');
        } catch (error) {
            console.error('Lỗi khi xuất ảnh PNG:', error);
            setMessage(`Lỗi khi xuất ảnh PNG: ${error.message}`);
        } finally {
            document.body.removeChild(exportDiv);
        }
    };

    // Function to draw pot for a specific table within the current fund
    const performWithdrawal = async (tableId, receiverId) => {
        if (!db || !currentFund) {
            setMessage('Lỗi: Firebase hoặc quỹ hiện tại chưa sẵn sàng.');
            return false;
        }

        const tableIndex = currentFund.tables.findIndex(t => t.id === tableId);
        if (tableIndex === -1) {
            setMessage(`Lỗi: Không tìm thấy bảng ${tableId} trong quỹ hiện tại.`);
            return false;
        }

        const currentTable = currentFund.tables[tableIndex];
        const currentMembersState = currentTable.members;

        const receiver = currentMembersState.find(m => m.id === receiverId);
        if (!receiver || receiver.hasReceivedPot) {
            setMessage(`Lỗi: Người được chọn (${receiver?.name || receiverId}) không hợp lệ hoặc đã rút quỹ rồi.`);
            return false;
        }

        try {
            // Count members who have already withdrawn *in this table*, excluding the current receiver
            const alreadyWithdrawnMembersCount = currentMembersState.filter(
                m => m.hasReceivedPot && m.id !== receiver.id
            ).length;

            const totalOtherMembers = currentTable.membersPerTable - 1; // Total members contributing to the pot
            const unwithdrawnOtherMembersCount = totalOtherMembers - alreadyWithdrawnMembersCount;

            // Calculate pot received based on the new rule
            const potReceived =
                (alreadyWithdrawnMembersCount * currentTable.baseContribution) +
                (unwithdrawnOtherMembersCount * (currentTable.baseContribution - currentTable.interestPerOtherMember));
            
            const totalInterestPaidByReceiver = unwithdrawnOtherMembersCount * currentTable.interestPerOtherMember; 
            const netContributionPerPayer = currentTable.baseContribution - currentTable.interestPerOtherMember;

            const updatedMembers = currentTable.members.map(m =>
                m.id === receiver.id ? { ...m, hasReceivedPot: true } : m
            );

            const newRound = {
                roundNumber: currentTable.nextRoundNumber,
                receiverId: receiver.id,
                receiverName: receiver.name,
                potReceived: potReceived,
                totalInterestPaidByReceiver: totalInterestPaidByReceiver,
                netContributionPerPayer: netContributionPerPayer,
                date: new Date().toISOString(),
                tableId: currentTable.id, // Store tableId in round for easier filtering later
            };

            const updatedTables = [...currentFund.tables];
            updatedTables[tableIndex] = {
                ...currentTable,
                members: updatedMembers,
                rounds: [...currentTable.rounds, newRound],
                nextRoundNumber: currentTable.nextRoundNumber + 1,
            };

            // Update the entire fund document in Firestore
            await updateDoc(doc(db, fundsCollectionPath, currentFund.id), { tables: updatedTables });

            setMessage(`Quỹ "${currentFund.name}", Bảng ${currentTable.name}: ${receiver.name} đã rút quỹ thành công! Tiền nhận được: ${potReceived.toLocaleString('vi-VN')} VND.`);
            return true;
        } catch (error) {
            console.error("Error performing withdrawal:", error);
            setMessage(`Lỗi khi rút quỹ cho bảng ${currentTable.name}: ${error.message}`);
            return false;
        }
    };

    // Function to cancel the last withdrawal for a specific table within the current fund
    const handleCancelLastWithdrawal = async (tableId) => {
        if (!db || !currentFund) {
            setMessage('Lỗi: Firebase hoặc quỹ hiện tại chưa sẵn sàng.');
            return;
        }

        const tableIndex = currentFund.tables.findIndex(t => t.id === tableId);
        if (tableIndex === -1) {
            setMessage(`Lỗi: Không tìm thấy bảng ${tableId} trong quỹ hiện tại.`);
            return;
        }

        const currentTable = currentFund.tables[tableIndex];

        if (currentTable.rounds.length === 0) {
            setMessage(`Bảng ${currentTable.name} chưa có lượt rút quỹ nào để hủy.`);
            return;
        }

        const lastRound = currentTable.rounds[currentTable.rounds.length - 1];
        const lastReceiverId = lastRound.receiverId;
        const lastReceiverName = lastRound.receiverName;

        const confirmCancel = window.confirm(`Bạn có chắc chắn muốn hủy lượt rút quỹ cuối cùng của quỹ "${currentFund.name}", bảng ${currentTable.name} (người nhận: ${lastReceiverName}) không?`);
        if (!confirmCancel) {
            return;
        }

        try {
            const updatedMembers = currentTable.members.map(m =>
                m.id === lastReceiverId ? { ...m, hasReceivedPot: false } : m
            );

            const updatedRounds = currentTable.rounds.slice(0, -1);

            const updatedTables = [...currentFund.tables];
            updatedTables[tableIndex] = {
                ...currentTable,
                members: updatedMembers,
                rounds: updatedRounds,
                nextRoundNumber: currentTable.nextRoundNumber - 1,
            };

            await updateDoc(doc(db, fundsCollectionPath, currentFund.id), { tables: updatedTables });

            setMessage(`Đã hủy lượt rút quỹ cuối cùng của quỹ "${currentFund.name}", bảng ${currentTable.name} thành công. Người ${lastReceiverName} đã có thể rút lại quỹ.`);
        } catch (error) {
            console.error("Error canceling last withdrawal:", error);
            setMessage(`Lỗi khi hủy rút quỹ: ${error.message}`);
        }
    };

    // Function to handle drawing pot for all tables simultaneously (random) for current fund
    const handleDrawAllTablesRandom = async () => {
        if (!db || !currentFund) {
            setMessage('Lỗi: Firebase hoặc quỹ hiện tại chưa sẵn sàng.');
            return;
        }

        const confirmDrawAll = window.confirm(`Bạn có chắc chắn muốn rút quỹ ngẫu nhiên cho tất cả các bảng trong quỹ "${currentFund.name}" cùng lúc không?`);
        if (!confirmDrawAll) {
            return;
        }

        setMessage(`Đang rút quỹ ngẫu nhiên cho tất cả các bảng trong quỹ "${currentFund.name}"...`);
        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;
        let newTablesState = [...currentFund.tables];

        for (let i = 0; i < newTablesState.length; i++) {
            const table = newTablesState[i];
            const availableMembers = table.members.filter(member => !member.hasReceivedPot);
            if (availableMembers.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableMembers.length);
                const randomReceiver = availableMembers[randomIndex];

                try {
                    const alreadyWithdrawnMembersCount = table.members.filter(m => m.hasReceivedPot && m.id !== randomReceiver.id).length;
                    const totalOtherMembers = table.membersPerTable - 1;
                    const unwithdrawnOtherMembersCount = totalOtherMembers - alreadyWithdrawnMembersCount;

                    const potReceived =
                        (alreadyWithdrawnMembersCount * table.baseContribution) +
                        (unwithdrawnOtherMembersCount * (table.baseContribution - table.interestPerOtherMember));
                    
                    const totalInterestPaidByReceiver = unwithdrawnOtherMembersCount * table.interestPerOtherMember; 
                    const netContributionPerPayer = table.baseContribution - table.interestPerOtherMember;

                    const updatedMembers = table.members.map(m =>
                        m.id === randomReceiver.id ? { ...m, hasReceivedPot: true } : m
                    );

                    const newRound = {
                        roundNumber: table.nextRoundNumber,
                        receiverId: randomReceiver.id,
                        receiverName: randomReceiver.name,
                        potReceived: potReceived,
                        totalInterestPaidByReceiver: totalInterestPaidByReceiver,
                        netContributionPerPayer: netContributionPerPayer,
                        date: new Date().toISOString(),
                        tableId: table.id,
                    };

                    newTablesState[i] = {
                        ...table,
                        members: updatedMembers,
                        rounds: [...table.rounds, newRound],
                        nextRoundNumber: table.nextRoundNumber + 1,
                    };
                    successCount++;
                } catch (error) {
                    console.error(`Lỗi khi rút quỹ ngẫu nhiên cho bảng ${table.name}:`, error);
                    failCount++;
                }
            } else {
                skipCount++;
                console.log(`Bảng ${table.name} đã hoàn thành tất cả các lượt rút quỹ. Bỏ qua.`);
            }
        }

        try {
            await updateDoc(doc(db, fundsCollectionPath, currentFund.id), { tables: newTablesState });
            setMessage(`Đã hoàn thành rút quỹ ngẫu nhiên cho quỹ "${currentFund.name}": ${successCount} lượt thành công, ${failCount} lượt thất bại, ${skipCount} bảng đã hoàn thành.`);
        } catch (error) {
            console.error("Lỗi cập nhật Firestore sau rút quỹ ngẫu nhiên toàn bảng:", error);
            setMessage(`Lỗi cập nhật dữ liệu sau rút quỹ ngẫu nhiên: ${error.message}`);
        }
    };


    // Render loading state or the application
    if (loadingData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-xl font-semibold text-gray-700">Đang tải ứng dụng quản lý quỹ...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 font-inter p-4 flex flex-col items-center">
            <h1 className="text-4xl font-bold text-gray-800 mb-6 text-center">Phần Mềm Quản Lý Quỹ IDP 🤝</h1>
            <p className="text-sm text-gray-600 mb-4 text-center">
                ID người dùng hiện tại: <span className="font-mono bg-gray-200 p-1 rounded-md">{userId}</span>
            </p>

            {message && (
                <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded-md mb-6 shadow-md" role="alert">
                    <p className="font-bold">Thông báo:</p>
                    <p>{message}</p>
                </div>
            )}

            {/* Fund Selection/Creation UI */}
            {!currentFund ? (
                <div className="bg-white p-8 rounded-lg shadow-lg text-center w-full max-w-md">
                    <h2 className="text-2xl font-bold text-gray-700 mb-6">Chào mừng đến với Quản Lý Quỹ IDP</h2>
                    {allFunds.length === 0 ? (
                        <>
                            <p className="text-xl text-gray-700 mb-6">Chưa có quỹ nào được tạo. Hãy tạo một quỹ mới!</p>
                            <CreateFundForm 
                                newFundName={newFundName} setNewFundName={setNewFundName}
                                initialBaseContribution={initialBaseContribution} setInitialBaseContribution={setInitialBaseContribution}
                                numMembersTotal={numMembersTotal} setNumMembersTotal={setNumMembersTotal}
                                startDate={startDate} setStartDate={setStartDate}
                                durationInMonths={durationInMonths} setDurationInMonths={setDurationInMonths}
                                calculatedEndDate={calculatedEndDate}
                                monthlyWithdrawalDay={monthlyWithdrawalDay} setMonthlyWithdrawalDay={setMonthlyWithdrawalDay}
                                onCreateFund={createNewFund}
                            />
                        </>
                    ) : (
                        <>
                            <p className="text-xl text-gray-700 mb-6">Vui lòng chọn một quỹ để quản lý hoặc tạo một quỹ mới.</p>
                            <button
                                onClick={() => setShowFundSelectionModal(true)}
                                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 mr-4"
                            >
                                Chọn Quỹ Đã Có
                            </button>
                            <button
                                onClick={() => setShowFundSelectionModal(true)} // Use the same modal, just change behavior inside
                                className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                Tạo Quỹ Mới
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <>
                    {/* Display current fund name and selection button */}
                    <div className="bg-white p-4 rounded-lg shadow-md mb-6 w-full max-w-6xl text-center">
                        <h2 className="text-3xl font-bold text-gray-800 mb-2">Quỹ hiện tại: <span className="text-indigo-700">{currentFund.name}</span></h2>
                        <button
                            onClick={() => setShowFundSelectionModal(true)}
                            className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition duration-300 ease-in-out"
                        >
                            Đổi Quỹ / Tạo Quỹ Mới
                        </button>
                        {currentFund.status === 'active' && (
                             <button
                                onClick={() => {
                                    if (window.confirm(`Bạn có chắc chắn muốn hoàn thành quỹ "${currentFund.name}" không? Thao tác này sẽ đánh dấu quỹ này là đã hoàn thành và có thể ẩn khỏi danh sách quỹ đang hoạt động.`)) {
                                        updateDoc(doc(db, fundsCollectionPath, currentFund.id), { status: 'completed' });
                                        setMessage(`Quỹ "${currentFund.name}" đã được đánh dấu là HOÀN THÀNH.`);
                                        setCurrentFundId(null); // Deselect current fund
                                    }
                                }}
                                className="ml-4 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition duration-300 ease-in-out"
                            >
                                Hoàn thành Quỹ này
                            </button>
                        )}
                        {currentFund.status !== 'active' && (
                             <button
                                onClick={() => {
                                    if (window.confirm(`Bạn có chắc chắn muốn kích hoạt lại quỹ "${currentFund.name}" không?`)) {
                                        updateDoc(doc(db, fundsCollectionPath, currentFund.id), { status: 'active' });
                                        setMessage(`Quỹ "${currentFund.name}" đã được KÍCH HOẠT LẠI.`);
                                    }
                                }}
                                className="ml-4 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition duration-300 ease-in-out"
                            >
                                Kích hoạt lại Quỹ này
                            </button>
                        )}
                         <button
                            onClick={() => {
                                if (window.confirm(`Bạn có chắc chắn muốn XÓA quỹ "${currentFund.name}" VĨNH VIỄN không? Thao tác này không thể hoàn tác.`)) {
                                    deleteDoc(doc(db, fundsCollectionPath, currentFund.id));
                                    setMessage(`Quỹ "${currentFund.name}" đã được XÓA.`);
                                    setCurrentFundId(null); // Deselect current fund
                                }
                            }}
                            className="ml-4 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition duration-300 ease-in-out"
                        >
                            Xóa Quỹ này
                        </button>
                    </div>

                    {/* Main content layout adjusted for horizontal flow */}
                    <div className="flex flex-col lg:flex-row flex-wrap justify-center items-stretch gap-8 mb-6 w-full max-w-6xl">
                        {/* Dashboard Section */}
                        <div className="bg-white p-6 rounded-lg shadow-lg flex-1 min-w-[300px]">
                            <h2 className="text-2xl font-bold text-gray-700 mb-4 text-center">Dashboard Thống Kê</h2>
                            {monthlyReminderMessage && (
                                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-3 rounded-md mb-4 font-bold text-center">
                                    {monthlyReminderMessage}
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-4">
                                <div className="bg-purple-50 p-4 rounded-lg shadow-sm">
                                    <p className="text-sm font-semibold text-purple-700">Tổng số người</p>
                                    <p className="text-3xl font-bold text-purple-900">{totalRegisteredMembers}</p>
                                </div>
                                <div className="bg-green-50 p-4 rounded-lg shadow-sm">
                                    <p className="text-sm font-semibold text-green-700">Đã rút quỹ</p>
                                    <p className="text-3xl font-bold text-green-900">{totalWithdrawnMembers}</p>
                                </div>
                                <div className="bg-red-50 p-4 rounded-lg shadow-sm">
                                    <p className="text-sm font-semibold text-red-700">Còn lại</p>
                                    <p className="text-3xl font-bold text-red-900">{totalRemainingMembers}</p>
                                </div>
                            </div>
                            <div className="text-center text-gray-700">
                                <p className="text-sm font-semibold mb-2">Thời gian chơi:</p>
                                <p className="text-md">
                                    Từ: <span className="font-bold">{currentFund.startDate ? new Date(currentFund.startDate).toLocaleDateString('vi-VN') : 'N/A'}</span>
                                    - Đến: <span className="font-bold">{currentFund.endDate ? new Date(currentFund.endDate).toLocaleDateString('vi-VN') : 'N/A'}</span>
                                </p>
                                <p className="text-md mt-2">
                                    Ngày rút quỹ hàng tháng: <span className="font-bold text-indigo-700">{currentFund.monthlyWithdrawalDay || 'N/A'}</span>
                                </p>
                                <p className="text-lg font-bold mt-2">
                                    Thời gian còn lại: <span className="text-blue-700">{timeRemainingDisplay}</span>
                                </p>
                            </div>
                        </div>

                        {/* Export to PNG Section */}
                        <div className="bg-white p-6 rounded-lg shadow-lg flex-1 min-w-[300px]">
                            <h2 className="text-2xl font-bold text-gray-700 mb-4">Xuất Danh sách đã rút quỹ (PNG)</h2>
                            <p className="text-sm text-gray-600 mb-4">
                                Nhấp vào nút dưới đây để xuất danh sách các thành viên đã rút quỹ **vào ngày 25 của tháng hiện tại**, kèm số tài khoản ngân hàng và mã QR, thành một ảnh PNG.
                            </p>
                            <button
                                onClick={exportWithdrawnMembersToPNG}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                Xuất Danh Sách ra Ảnh PNG (Ngày 25)
                            </button>
                        </div>

                        {/* Buttons for withdrawals */}
                        <div className="bg-white p-6 rounded-lg shadow-lg flex-1 min-w-[300px] text-center">
                            <h2 className="text-2xl font-bold text-gray-700 mb-4">Quản lý Rút Quỹ</h2>
                            <button
                                onClick={handleDrawAllTablesRandom}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 mb-4"
                            >
                                Rút Quỹ Ngẫu Nhiên cho TẤT CẢ các Bảng
                            </button>
                            <button
                                onClick={() => setShowAllTablesManualWithdrawalModal(true)}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                Rút Quỹ Thủ Công cho TẤT CẢ các Bảng
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
                        {currentFund.tables?.map(table => (
                            <HuiTable
                                key={table.id}
                                table={table}
                                db={db}
                                huiCollectionPath={fundsCollectionPath} // Pass funds collection path
                                currentFundId={currentFund.id} // Pass current fund ID
                                setMessage={setMessage}
                                onCancelLastWithdrawal={handleCancelLastWithdrawal}
                                performWithdrawal={performWithdrawal}
                            />
                        ))}
                    </div>
                </>
            )}
            {/* Hidden div to hold content for html2canvas to render */}
            <div ref={exportContentRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}></div>

            {/* Modal for manual withdrawal for all tables */}
            {showAllTablesManualWithdrawalModal && (
                <AllTablesManualWithdrawalModal
                    tables={currentFund?.tables || []} // Pass current fund's tables
                    onClose={() => setShowAllTablesManualWithdrawalModal(false)}
                    performWithdrawal={performWithdrawal}
                    setMessage={setMessage}
                />
            )}

            {/* Global Fund Selection/Creation Modal */}
            {showFundSelectionModal && (
                <FundSelectionModal
                    allFunds={allFunds}
                    currentFundId={currentFundId}
                    setCurrentFundId={setCurrentFundId}
                    onCreateNewFund={createNewFund} // Pass the new fund creation function
                    onClose={() => setShowFundSelectionModal(false)}
                    setMessage={setMessage}
                    // Pass form states for new fund creation
                    newFundName={newFundName} setNewFundName={setNewFundName}
                    initialBaseContribution={initialBaseContribution} setInitialBaseContribution={setInitialBaseContribution}
                    numMembersTotal={numMembersTotal} setNumMembersTotal={setNumMembersTotal}
                    startDate={startDate} setStartDate={setStartDate}
                    durationInMonths={durationInMonths} setDurationInMonths={setDurationInMonths}
                    calculatedEndDate={calculatedEndDate}
                    monthlyWithdrawalDay={monthlyWithdrawalDay} setMonthlyWithdrawalDay={setMonthlyWithdrawalDay}
                />
            )}
        </div>
    );
};

// Component for a single IDP Capital Table
// This component now receives currentFundId as a prop to correctly update Firestore
const HuiTable = ({ table, db, huiCollectionPath, currentFundId, setMessage, onCancelLastWithdrawal, performWithdrawal }) => { 
    const availableMembers = table.members.filter(member => !member.hasReceivedPot);
    const [showSelectionModal, setShowSelectionModal] = useState(false);
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [selectionType, setSelectionType] = useState('manual'); // 'manual' or 'random'
    const [showEditMemberModal, setShowEditMemberModal] = useState(false); // New state for edit modal
    const [memberToEdit, setMemberToEdit] = useState(null); // State to hold member being edited

    // Function to handle "Rút Quỹ" (Withdraw Capital) from modal
    const handleDrawPotFromModal = async () => {
        let receiverIdToDraw = selectedMemberId;
        if (selectionType === 'random') {
            if (availableMembers.length === 0) {
                setMessage(`Bảng ${table.name} đã hoàn thành tất cả các lượt rút quỹ.`);
                setShowSelectionModal(false);
                return;
            }
            const randomIndex = Math.floor(Math.random() * availableMembers.length);
            receiverIdToDraw = availableMembers[randomIndex].id;
        } else { // Manual selection
            if (!receiverIdToDraw) {
                setMessage('Vui lòng chọn một người rút quỹ.');
                return;
            }
            const receiverExists = availableMembers.some(m => m.id === receiverIdToDraw);
            if (!receiverExists) {
                setMessage('Người được chọn không hợp lệ hoặc đã rút quỹ rồi.');
                return;
            }
        }
        
        // Call the parent's performWithdrawal function
        const success = await performWithdrawal(table.id, receiverIdToDraw);
        if (success) {
            setSelectedMemberId(''); // Reset selected member
            setShowSelectionModal(false); // Close modal
        }
    };

    // Function to handle opening the edit modal
    const handleEditMemberClick = (member) => {
        setMemberToEdit(member);
        setShowEditMemberModal(true);
    };

    // Function to save edited member details to Firestore
    const handleSaveMemberDetails = async (memberId, newName, newBankAccountNumber, newBankName) => {
        if (!db || !currentFundId) { // Ensure db and currentFundId are available
            setMessage('Lỗi: Firebase hoặc quỹ hiện tại chưa sẵn sàng.');
            return;
        }
        try {
            const fundRef = doc(db, huiCollectionPath, currentFundId); // Reference to the current fund document
            
            // Find the table within the current fund's tables array
            const currentFundDoc = await getDoc(fundRef);
            if (!currentFundDoc.exists()) {
                setMessage('Lỗi: Quỹ hiện tại không tồn tại.');
                return;
            }
            let fundsData = currentFundDoc.data();
            let updatedTablesInFund = fundsData.tables.map(t => {
                if (t.id === table.id) { // Find the specific table being edited
                    return {
                        ...t,
                        members: t.members.map(m =>
                            m.id === memberId ? { ...m, name: newName, bankAccountNumber: newBankAccountNumber, bankName: newBankName } : m
                        )
                    };
                }
                return t;
            });

            await updateDoc(fundRef, { tables: updatedTablesInFund });
            setMessage(`Đã cập nhật thông tin cho ${newName}.`);
            setShowEditMemberModal(false);
            setMemberToEdit(null);
        } catch (error) {
            console.error("Error updating member details:", error);
            setMessage(`Lỗi khi cập nhật thông tin thành viên: ${error.message}`);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-700 mb-4">{table.name}</h2>
            <p className="text-md text-gray-600 mb-2">
                Tổng số người: <span className="font-semibold">{table.members.length}</span>
            </p>
            <p className="text-md text-gray-600 mb-2">
                Góp quỹ gốc mỗi người/lượt: <span className="font-semibold">{table.baseContribution.toLocaleString('vi-VN')} VND</span>
            </p>
            <p className="text-md text-gray-600 mb-4">
                Lãi (người rút quỹ trả cho người khác): <span className="font-semibold">{table.interestPerOtherMember.toLocaleString('vi-VN')} VND/người/lượt</span>
            </p>

            <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Danh sách thành viên:</h3>
                <ul className="grid grid-cols-1 gap-2 text-sm">
                    {table.members.map(member => (
                        <li key={member.id} className={`p-2 rounded-md flex items-center justify-between ${member.hasReceivedPot ? 'bg-gray-200 text-gray-500 line-through' : 'bg-blue-50 text-blue-700'}`}>
                            <div className="flex flex-col flex-grow">
                                <span>{member.name} {member.hasReceivedPot && ' (Đã rút quỹ)'}</span>
                                <div className="flex items-center mt-1 text-xs text-gray-600">
                                    <span className="mr-2">STK: <span className="font-mono font-semibold">{member.bankAccountNumber || 'Chưa có'}</span></span>
                                    <span className="mr-2">Ngân hàng: <span className="font-mono font-semibold">{member.bankName || 'Chưa có'}</span></span>
                                    {member.bankAccountNumber && (
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=50x50&data=${encodeURIComponent(`STK:${member.bankAccountNumber}, NH:${member.bankName || 'Khong ro'}, ChuTK:${removeVietnameseAccents(member.name)}`)}`}
                                            alt={`Mã QR cho ${member.bankAccountNumber}`}
                                            className="w-8 h-8 rounded-sm shadow-sm"
                                            style={{ width: '32px', height: '32px', borderRadius: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                        />
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => handleEditMemberClick(member)}
                                className="ml-4 p-2 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-full shadow-md transition duration-300 ease-in-out"
                                title="Chỉnh sửa thông tin thành viên"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.109 7.027c-.451.13-.913.195-1.378.195a2.503 2.503 0 01-2.07-3.952c.882-1.314 2.37-2.186 3.998-2.07 1.628.117 2.915 1.05 3.55 2.554a.5.5 0 00.91-.428c-.808-1.928-2.834-3.327-5.076-3.483-2.242-.156-4.394.757-5.592 2.766a4.502 4.502 0 002.502 6.096c.713.253 1.488.384 2.274.384 1.706 0 3.23-.746 4.316-2.05a.5.5 0 00-.91-.428z"/>
                                    <path d="M12.986 6.586a.5.5 0 00-.91.428c.808 1.928 2.834 3.327 5.076 3.483 2.242.156 4.394-.757 5.592-2.766a4.502 4.502 0 00-2.502-6.096c-.713-.253-1.488-.384-2.274-.384-1.706 0-3.23.746-4.316 2.05a.5.5 0 00-.91-.428zM17.414 13.586a2 2 0 11-2.828 2.828l-.793-.793 2.828-2.828.793.793z"/>
                                </svg>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Lịch sử rút quỹ:</h3>
                {table.rounds.length === 0 ? (
                    <p className="text-gray-500 text-sm">Chưa có lượt rút quỹ nào.</p>
                ) : (
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                        {table.rounds.map(round => (
                            <div key={round.roundNumber} className="mb-2 p-2 border-b border-gray-200 last:border-b-0">
                                <p className="font-semibold text-gray-700">Lượt {round.roundNumber}: {round.receiverName}</p>
                                <p className="text-sm text-gray-600">Tiền nhận: <span className="font-bold text-green-700">{round.potReceived.toLocaleString('vi-VN')} VND</span></p>
                                <p className="text-sm text-gray-600">Tổng lãi người rút quỹ trả: <span className="font-bold text-red-700">{round.totalInterestPaidByReceiver.toLocaleString('vi-VN')} VND</span></p>
                                <p className="text-sm text-gray-600">Mỗi người góp quỹ còn lại: <span className="font-bold text-blue-700">{round.netContributionPerPayer.toLocaleString('vi-VN')} VND</span></p>
                                <p className="text-xs text-gray-500">Ngày: {new Date(round.date).toLocaleDateString('vi-VN')}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-col space-y-4">
                {availableMembers.length > 0 && (
                    <button
                        onClick={() => setShowSelectionModal(true)}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        Rút Quỹ cho Bảng {table.name} (Còn {availableMembers.length} người)
                    </button>
                )}
                {table.rounds.length > 0 && (
                    <button
                        onClick={() => onCancelLastWithdrawal(table.id)}
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        Hủy Lượt Rút Quỹ Cuối ({table.rounds[table.rounds.length - 1]?.receiverName})
                    </button>
                )}
            </div>
            

            {showSelectionModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                        <h3 className="text-2xl font-bold mb-6 text-center text-gray-800">Chọn người rút quỹ</h3>
                        <div className="mb-4">
                            <label className="inline-flex items-center mr-4">
                                <input
                                    type="radio"
                                    className="form-radio text-indigo-600"
                                    name="selectionType"
                                    value="manual"
                                    checked={selectionType === 'manual'}
                                    onChange={() => setSelectionType('manual')}
                                />
                                <span className="ml-2 text-gray-700">Thủ công</span>
                            </label>
                            <label className="inline-flex items-center">
                                <input
                                    type="radio"
                                    className="form-radio text-indigo-600"
                                    name="selectionType"
                                    value="random"
                                    checked={selectionType === 'random'}
                                    onChange={() => setSelectionType('random')}
                                />
                                <span className="ml-2 text-gray-700">Ngẫu nhiên</span>
                            </label>
                        </div>

                        {selectionType === 'manual' && (
                            <div className="mb-6">
                                <label htmlFor="memberSelect" className="block text-gray-700 text-sm font-bold mb-2">
                                    Chọn thành viên:
                                </label>
                                <select
                                    id="memberSelect"
                                    className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={selectedMemberId}
                                    onChange={(e) => setSelectedMemberId(e.target.value)}
                                >
                                    <option value="">-- Chọn người --</option>
                                    {availableMembers.map(member => (
                                        <option key={member.id} value={member.id}>
                                            {member.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={() => setShowSelectionModal(false)}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleDrawPotFromModal}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                            >
                                Xác nhận Rút Quỹ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showEditMemberModal && memberToEdit && (
                <EditMemberModal
                    member={memberToEdit}
                    onSave={handleSaveMemberDetails}
                    onClose={() => setShowEditMemberModal(false)}
                />
            )}
        </div>
    );
};

// Component for editing member details (e.g., name, bank account number)
const EditMemberModal = ({ member, onSave, onClose }) => {
    const [newMemberName, setNewMemberName] = useState(member.name || '');
    const [newBankAccount, setNewBankAccount] = useState(member.bankAccountNumber || '');
    const [newBankName, setNewBankName] = useState(member.bankName || '');

    const handleSave = () => {
        onSave(member.id, newMemberName, newBankAccount, newBankName);
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                <h3 className="text-2xl font-bold mb-6 text-center text-gray-800">Chỉnh sửa thông tin thành viên</h3>
                <div className="mb-4">
                    <label htmlFor="memberNameInput" className="block text-gray-700 text-sm font-bold mb-2">
                        Tên thành viên:
                    </label>
                    <input
                        type="text"
                        id="memberNameInput"
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        placeholder="Nhập tên thành viên"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                    />
                </div>
                <div className="mb-4">
                    <label htmlFor="bankAccountInput" className="block text-gray-700 text-sm font-bold mb-2">
                        Số tài khoản ngân hàng:
                    </label>
                    <input
                        type="text"
                        id="bankAccountInput"
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        placeholder="Nhập số tài khoản"
                        value={newBankAccount}
                        onChange={(e) => setNewBankAccount(e.target.value)}
                    />
                </div>
                <div className="mb-4">
                    <label htmlFor="bankNameInput" className="block text-gray-700 text-sm font-bold mb-2">
                        Tên ngân hàng:
                    </label>
                    <input
                        type="text"
                        id="bankNameInput"
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        placeholder="Nhập tên ngân hàng (VD: Vietcombank)"
                        value={newBankName}
                        onChange={(e) => setNewBankName(e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        (Thông tin này sẽ được thêm vào mã QR.)
                    </p>
                </div>

                <div className="flex justify-end space-x-4">
                    <button
                        onClick={onClose}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSave}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                    >
                        Lưu
                    </button>
                </div>
            </div>
        </div>
    );
};

// Component for manual withdrawal for all tables
const AllTablesManualWithdrawalModal = ({ tables, onClose, performWithdrawal, setMessage }) => {
    const [selectedMembersForTables, setSelectedMembersForTables] = useState(() => {
        const initialSelections = {};
        tables.forEach(table => {
            if (table.members.filter(m => !m.hasReceivedPot).length > 0) {
                initialSelections[table.id] = '';
            }
        });
        return initialSelections;
    });

    const handleMemberSelectChange = (tableId, memberId) => {
        setSelectedMembersForTables(prev => ({
            ...prev,
            [tableId]: memberId
        }));
    };

    const handleConfirmAllWithdrawals = async () => {
        setMessage('Đang thực hiện rút quỹ thủ công cho các bảng đã chọn...');
        let successCount = 0;
        let failCount = 0;
        let skippedTables = [];

        for (const tableId in selectedMembersForTables) {
            const memberId = selectedMembersForTables[tableId];
            if (memberId) {
                const success = await performWithdrawal(tableId, memberId);
                if (success) {
                    successCount++;
                } else {
                    failCount++;
                }
            } else {
                skippedTables.push(tables.find(t => t.id === tableId)?.name || tableId);
            }
        }

        let finalMessage = `Đã hoàn thành rút quỹ thủ công: ${successCount} lượt thành công, ${failCount} lượt thất bại.`;
        if (skippedTables.length > 0) {
            finalMessage += ` Các bảng sau đã bị bỏ qua do chưa chọn người rút quỹ: ${skippedTables.join(', ')}.`;
        }
        setMessage(finalMessage);
        onClose();
    };

    const tablesWithAvailableMembers = tables.filter(table => table.members.filter(m => !m.hasReceivedPot).length > 0);

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-2xl font-bold mb-6 text-center text-gray-800">Chọn người rút quỹ thủ công cho từng bảng</h3>
                
                {tablesWithAvailableMembers.length === 0 ? (
                    <p className="text-center text-gray-600">Hiện không có bảng nào còn người để rút quỹ.</p>
                ) : (
                    <div className="space-y-6 mb-8">
                        {tablesWithAvailableMembers.map(table => (
                            <div key={table.id} className="border border-gray-200 p-4 rounded-md">
                                <h4 className="text-xl font-semibold text-gray-700 mb-3">{table.name}</h4>
                                <label htmlFor={`select-${table.id}`} className="block text-gray-700 text-sm font-bold mb-2">
                                    Chọn thành viên:
                                </label>
                                <select
                                    id={`select-${table.id}`}
                                    className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={selectedMembersForTables[table.id] || ''}
                                    onChange={(e) => handleMemberSelectChange(table.id, e.target.value)}
                                >
                                    <option value="">-- Chọn người --</option>
                                    {table.members.filter(m => !m.hasReceivedPot).map(member => (
                                        <option key={member.id} value={member.id}>
                                            {member.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-end space-x-4">
                    <button
                        onClick={onClose}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleConfirmAllWithdrawals}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                        disabled={tablesWithAvailableMembers.length === 0 || Object.values(selectedMembersForTables).every(selection => !selection)}
                    >
                        Xác nhận Rút Quỹ Thủ Công (Các Bảng Đã Chọn)
                    </button>
                </div>
            </div>
        </div>
    );
};

// New Component for Create/Select Fund Modal
const FundSelectionModal = ({ 
    allFunds, currentFundId, setCurrentFundId, onCreateNewFund, onClose, setMessage,
    newFundName, setNewFundName,
    initialBaseContribution, setInitialBaseContribution,
    numMembersTotal, setNumMembersTotal,
    startDate, setStartDate,
    durationInMonths, setDurationInMonths,
    calculatedEndDate,
    monthlyWithdrawalDay, setMonthlyWithdrawalDay
}) => {
    const [showCreateForm, setShowCreateForm] = useState(false);

    const handleSelectFund = (fundId) => {
        setCurrentFundId(fundId);
        onClose(); // Close modal after selection
        setMessage('Đã chọn quỹ thành công.');
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-2xl font-bold mb-6 text-center text-gray-800">Quản lý Quỹ IDP</h3>
                
                {allFunds.length > 0 && (
                    <div className="mb-8">
                        <h4 className="text-xl font-semibold text-gray-700 mb-4">Chọn Quỹ Đã Có:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                            {allFunds.map(fund => (
                                <div 
                                    key={fund.id} 
                                    className={`p-4 border rounded-lg shadow-sm cursor-pointer transition duration-200 
                                                ${fund.id === currentFundId ? 'bg-indigo-100 border-indigo-600 ring-2 ring-indigo-500' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'}
                                                ${fund.status === 'completed' ? 'opacity-60 italic' : ''}`}
                                    onClick={() => handleSelectFund(fund.id)}
                                >
                                    <p className="font-bold text-lg text-gray-800">{fund.name}</p>
                                    <p className="text-sm text-gray-600">Trạng thái: <span className="font-semibold">{fund.status === 'active' ? 'Đang hoạt động' : 'Đã hoàn thành'}</span></p>
                                    <p className="text-sm text-gray-600">Số người: {fund.numMembersTotal}</p>
                                    <p className="text-sm text-gray-600">Từ: {new Date(fund.startDate).toLocaleDateString('vi-VN')}</p>
                                </div>
                            ))}
                        </div>
                        <div className="text-center">
                            <button
                                onClick={() => setShowCreateForm(true)}
                                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                            >
                                Tạo Quỹ Mới
                            </button>
                        </div>
                    </div>
                )}

                {(showCreateForm || allFunds.length === 0) && (
                    <div className="mt-8 pt-8 border-t border-gray-200">
                        <h4 className="text-xl font-semibold text-gray-700 mb-4">Tạo Quỹ Mới:</h4>
                        <CreateFundForm 
                            newFundName={newFundName} setNewFundName={setNewFundName}
                            initialBaseContribution={initialBaseContribution} setInitialBaseContribution={setInitialBaseContribution}
                            numMembersTotal={numMembersTotal} setNumMembersTotal={setNumMembersTotal}
                            startDate={startDate} setStartDate={setStartDate}
                            durationInMonths={durationInMonths} setDurationInMonths={setDurationInMonths}
                            calculatedEndDate={calculatedEndDate}
                            monthlyWithdrawalDay={monthlyWithdrawalDay} setMonthlyWithdrawalDay={setMonthlyWithdrawalDay}
                            onCreateFund={onCreateNewFund}
                        />
                    </div>
                )}

                <div className="flex justify-end space-x-4 mt-6">
                    <button
                        onClick={onClose}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
};

// Dedicated component for the Create Fund Form
const CreateFundForm = ({
    newFundName, setNewFundName,
    initialBaseContribution, setInitialBaseContribution,
    numMembersTotal, setNumMembersTotal,
    startDate, setStartDate,
    durationInMonths, setDurationInMonths,
    calculatedEndDate,
    monthlyWithdrawalDay, setMonthlyWithdrawalDay,
    onCreateFund
}) => {
    return (
        <>
            <div className="mb-4">
                <label htmlFor="newFundName" className="block text-gray-700 text-sm font-bold mb-2">
                    Tên Quỹ Mới:
                </label>
                <input
                    type="text"
                    id="newFundName"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    placeholder="Ví dụ: Quỹ Tết 2025"
                    value={newFundName}
                    onChange={(e) => setNewFundName(e.target.value)}
                />
            </div>
            <div className="mb-4">
                <label htmlFor="numMembersTotal" className="block text-gray-700 text-sm font-bold mb-2">
                    Tổng số người chơi (chia thành {NUM_TABLES} bảng):
                </label>
                <input
                    type="number"
                    id="numMembersTotal"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    placeholder="Ví dụ: 20"
                    value={numMembersTotal}
                    onChange={(e) => setNumMembersTotal(Number(e.target.value))}
                    min={NUM_TABLES}
                />
                <p className="text-xs text-gray-500 mt-1">
                    (Số này phải chia hết cho {NUM_TABLES} để chia đều vào các bảng.)
                </p>
            </div>
            <div className="mb-4">
                <label htmlFor="initialBaseContribution" className="block text-gray-700 text-sm font-bold mb-2">
                    Số tiền góp quỹ gốc mỗi người/lượt (VND):
                </label>
                <input
                    type="number"
                    id="initialBaseContribution"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    placeholder="Ví dụ: 500000"
                    value={initialBaseContribution}
                    onChange={(e) => setInitialBaseContribution(Number(e.target.value))}
                    min="1"
                />
            </div>
            <div className="mb-4">
                <label htmlFor="startDate" className="block text-gray-700 text-sm font-bold mb-2">
                    Ngày bắt đầu chơi:
                </label>
                <input
                    type="date"
                    id="startDate"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                />
            </div>
            <div className="mb-4">
                <label htmlFor="durationInMonths" className="block text-gray-700 text-sm font-bold mb-2">
                    Thời gian chơi (tháng):
                </label>
                <input
                    type="number"
                    id="durationInMonths"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    placeholder="Ví dụ: 12"
                    value={durationInMonths}
                    onChange={(e) => setDurationInMonths(Number(e.target.value))}
                    min="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                    (Ngày kết thúc sẽ được tự động tính toán: <span className="font-bold text-blue-600">{calculatedEndDate ? new Date(calculatedEndDate).toLocaleDateString('vi-VN') : 'N/A'}</span>)
                </p>
            </div>
            <div className="mb-6">
                <label htmlFor="monthlyWithdrawalDay" className="block text-gray-700 text-sm font-bold mb-2">
                    Ngày rút quỹ hàng tháng (1-31):
                </label>
                <input
                    type="number"
                    id="monthlyWithdrawalDay"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    placeholder="Ví dụ: 5"
                    value={monthlyWithdrawalDay}
                    onChange={(e) => setMonthlyWithdrawalDay(Number(e.target.value))}
                    min="1"
                    max="31"
                />
                <p className="text-xs text-gray-500 mt-1">
                    (Hệ thống sẽ nhắc nhở khi đến ngày này hàng tháng.)
                </p>
            </div>
            <button
                onClick={onCreateFund}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
            >
                Khởi Tạo Quỹ Mới
            </button>
        </>
    );
};

// Main App component wrapped with FirebaseProvider
export default function WrappedApp() {
    return (
        <FirebaseProvider>
            <App />
        </FirebaseProvider>
    );
}
